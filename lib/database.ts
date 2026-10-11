import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Journey } from "@/lib/schema";
import { journeys as bundledJourneys } from "@/data/curated/journeys";
import { mergeProcessJourneys } from "@/lib/process-catalog";

let singleton: Database.Database | null = null;

export function openDatabase(filename?: string) {
  const deployedOnVercel = Boolean(process.env.VERCEL);
  const configuredFilename = filename ?? process.env.GOVGUIDE_DB_PATH;
  let databasePath: string;
  if (deployedOnVercel) {
    // Vercel builds can expose GOVGUIDE_DB_PATH=:memory:; functions must read
    // the packaged snapshot. Search from the runtime cwd because function bundles
    // can be rooted below the project directory, and ignore stale relative paths.
    const roots: string[] = [];
    let root = process.cwd();
    for (let depth = 0; depth < 7; depth += 1) {
      roots.push(root);
      const parent = path.dirname(root);
      if (parent === root) break;
      root = parent;
    }
    const configuredCandidates = configuredFilename && configuredFilename !== ":memory:"
      ? path.isAbsolute(configuredFilename)
        ? [configuredFilename]
        : roots.map((candidateRoot) => path.resolve(candidateRoot, configuredFilename))
      : [];
    const snapshotCandidates = roots.map((candidateRoot) => path.join(candidateRoot, "data", "govguide.db"));
    databasePath = [...configuredCandidates, ...snapshotCandidates].find((candidate) => existsSync(candidate)) ?? snapshotCandidates[0];
  } else {
    databasePath = configuredFilename ?? path.join(process.cwd(), "data", "govguide.db");
  }
  if (!deployedOnVercel) mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath, deployedOnVercel ? { readonly: true, fileMustExist: true } : {});
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

export function migrateDatabase(database: Database.Database) {
  const migrationPath = path.join(process.cwd(), "database", "migrations", "001_initial.sql");
  database.exec(readFileSync(migrationPath, "utf8"));
}

export function getDatabase() {
  if (!singleton) singleton = openDatabase();
  return singleton;
}

export function loadVerifiedJourneys(database = getDatabase()): Journey[] {
  const rows = database.prepare("SELECT document_json FROM journeys j JOIN graph_nodes n ON n.id = j.node_id WHERE n.status = 'verified' ORDER BY j.category, n.label").all() as { document_json: string }[];
  return rows.map((row) => JSON.parse(row.document_json) as Journey);
}

export type IndexedAgency = {
  id: string;
  label: string;
  description: string;
  sourceUrl: string | null;
  jurisdiction: string | null;
  state: string | null;
  tags: string[];
  connector: string | null;
  connectedPages: { label: string; sourceUrl: string | null }[];
};

export function searchIndexedAgencies(options: { query?: string; collection?: string; limit?: number; offset?: number } = {}, database = getDatabase()) {
  const query = options.query?.trim().slice(0, 120) ?? "";
  const collection = options.collection ?? "all";
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);
  const where = ["n.status = 'machine-indexed'", "n.kind = 'agency'"];
  const params: (string | number)[] = [];
  if (collection === "federal") where.push("(json_extract(n.params_json, '$.connector') = 'federal-directory' OR json_extract(n.params_json, '$.connector') LIKE 'federal-sites-%')");
  if (collection === "state") where.push("(json_extract(n.params_json, '$.connector') = 'state-directory' OR json_extract(n.params_json, '$.connector') LIKE 'state-sites-%')");
  if (collection === "domains") where.push("json_extract(n.params_json, '$.connector') = 'government-domain-directory'");
  if (collection === "connected") where.push("EXISTS (SELECT 1 FROM graph_edges e JOIN graph_nodes p ON p.id = e.from_node_id WHERE e.to_node_id = n.id AND e.relation = 'published-by' AND p.kind = 'source' AND p.status = 'machine-indexed')");
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(n.label LIKE ? ESCAPE '\\' OR n.description LIKE ? ESCAPE '\\' OR n.source_url LIKE ? ESCAPE '\\' OR n.params_json LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern, pattern, pattern);
  }
  const clause = where.join(" AND ");
  const total = (database.prepare(`SELECT COUNT(*) AS total FROM graph_nodes n WHERE ${clause}`).get(...params) as { total: number }).total;
  const rows = database.prepare(`SELECT n.id, n.label, n.description, n.source_url AS sourceUrl, n.jurisdiction, n.params_json AS paramsJson FROM graph_nodes n WHERE ${clause} ORDER BY n.label COLLATE NOCASE, n.id LIMIT ? OFFSET ?`).all(...params, limit, offset) as { id: string; label: string; description: string; sourceUrl: string | null; jurisdiction: string | null; paramsJson: string }[];
  return {
    total,
    items: rows.map((row): IndexedAgency => {
      const metadata = JSON.parse(row.paramsJson) as { state?: string; tags?: string[]; connector?: string; jurisdiction?: string };
      const connectedPages = database.prepare("SELECT p.label, p.source_url AS sourceUrl FROM graph_edges e JOIN graph_nodes p ON p.id = e.from_node_id WHERE e.to_node_id = ? AND e.relation = 'published-by' AND p.kind = 'source' AND p.status = 'machine-indexed' ORDER BY p.label LIMIT 3").all(row.id) as { label: string; sourceUrl: string | null }[];
      return { id: row.id, label: row.label, description: row.description, sourceUrl: row.sourceUrl, jurisdiction: row.jurisdiction ?? metadata.jurisdiction ?? null, state: metadata.state ?? null, tags: metadata.tags ?? [], connector: metadata.connector ?? null, connectedPages };
    })
  };
}

export function getIndexedAgencyTotals(database = getDatabase()) {
  const rows = database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN n.jurisdiction = 'federal' OR json_extract(n.params_json, '$.jurisdiction') = 'federal' THEN 1 ELSE 0 END) AS federal, SUM(CASE WHEN n.jurisdiction = 'california' OR json_extract(n.params_json, '$.jurisdiction') IN ('state-or-territory', 'california') THEN 1 ELSE 0 END) AS state FROM graph_nodes n WHERE n.status = 'machine-indexed' AND n.kind = 'agency'").get() as { total: number; federal: number; state: number };
  const connected = (database.prepare("SELECT COUNT(DISTINCT e.to_node_id) AS total FROM graph_edges e JOIN graph_nodes n ON n.id = e.to_node_id WHERE e.relation = 'published-by' AND n.kind = 'agency' AND n.status = 'machine-indexed'").get() as { total: number }).total;
  return { total: rows.total, federal: rows.federal ?? 0, state: rows.state ?? 0, connected };
}

export function getStoredJourneys(): { journeys: Journey[]; storage: "sqlite" | "bundled-fallback" } {
  try {
    const records = loadVerifiedJourneys();
    if (records.length > 0) return { journeys: mergeProcessJourneys(records), storage: "sqlite" };
  } catch {
    // The bundled graph keeps the read path available during first-run setup.
  }
  return { journeys: bundledJourneys, storage: "bundled-fallback" };
}
