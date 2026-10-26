import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { journeys } from "@/data/curated/journeys";

const urls = [...new Set(journeys.flatMap((journey) => journey.sources.map((source) => source.url)))];

async function check(url: string) {
  const started = Date.now();
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Govroute/1.0 source monitor" } });
    // Some official sites reject or misroute HEAD requests even though the page is live.
    if (!response.ok) response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Govroute/1.0 source monitor", Range: "bytes=0-1024" } });
    return { url, ok: response.ok, status: response.status, finalUrl: response.url, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
  } catch (error) {
    return { url, ok: false, status: 0, error: error instanceof Error ? error.message : "Unknown error", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
  }
}

async function main() {
  const results = [];
  for (let index = 0; index < urls.length; index += 5) results.push(...await Promise.all(urls.slice(index, index + 5).map(check)));
  const report = { checkedAt: new Date().toISOString(), total: results.length, healthy: results.filter((item) => item.ok).length, results };
  const directory = path.join(process.cwd(), "data", "generated");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "source-health.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Checked ${report.total} sources: ${report.healthy} reachable, ${report.total - report.healthy} need review.\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : error}\n`); process.exitCode = 1; });
