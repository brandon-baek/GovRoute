"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { IndexedAgency } from "@/lib/database";
import styles from "./IndexedAgencyCatalog.module.css";

type Result = { total: number; items: IndexedAgency[] };

export function IndexedAgencyCatalog({ compact = false, initialTotal = 0, initialCollection = "all" }: { compact?: boolean; initialTotal?: number; initialCollection?: string }) {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState(initialCollection);
  const [result, setResult] = useState<Result>({ total: initialTotal, items: [] });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);

  async function load(nextOffset = 0, selectedCollection = collection) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ q: query, collection: selectedCollection, offset: String(nextOffset) });
      const response = await fetch(`/api/catalog?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Catalog request failed");
      const data = await response.json() as Result;
      if (controller.signal.aborted) return;
      setResult((current) => ({ total: data.total, items: nextOffset === 0 ? data.items : [...current.items, ...data.items] }));
      setOffset(nextOffset);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    const params = new URLSearchParams({ q: "", collection: initialCollection, offset: "0" });
    // Initial loading is already represented by state. Synchronize the remote
    // catalog after the request resolves and cancel it when the component leaves.
    fetch(`/api/catalog?${params}`, { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Catalog request failed"); return response.json() as Promise<Result>; })
      .then((data) => { if (!controller.signal.aborted) { setResult(data); setOffset(0); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => pending.current?.abort();
  }, [initialCollection]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(0);
  }

  return <section className={`${styles.catalog} ${compact ? styles.compact : ""}`} aria-label="Machine-indexed government directory">
    <div className={styles.heading}>
      <div><p className={styles.kicker}>Machine-indexed directory</p><h2>Explore government offices</h2><p>Official agency and .gov directory records. These are discovery listings, not reviewed instructions or endorsements.</p></div>
      <strong className={styles.count}>{result.total.toLocaleString()}<span> indexed records</span></strong>
    </div>
    <form className={styles.controls} onSubmit={submit}>
      <label className={styles.search}><span className={styles.srOnly}>Search government offices</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by office, service, state, or domain" /><button type="submit">Search</button></label>
      <label className={styles.filter}><span>Collection</span><select value={collection} onChange={(event) => { setCollection(event.target.value); void load(0, event.target.value); }}><option value="all">All indexed records</option><option value="federal">Federal agencies</option><option value="state">States and territories</option><option value="domains">All .gov domains</option><option value="connected">Linked to crawled pages</option></select></label>
    </form>
    {error ? <p className={styles.message} role="alert">The directory could not be loaded. Try again in a moment.</p> : <>
      <div className={styles.results} aria-live="polite">
        {result.items.map((item) => <article key={item.id} className={styles.row}>
          <div><h3>{item.label}</h3><p>{item.description}</p><div className={styles.meta}>{item.jurisdiction && <span>{item.jurisdiction.replaceAll("-", " ")}</span>}{item.state && <span>{item.state}</span>}{item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>{compact && item.connectedPages.length > 0 && <div className={styles.connections}><span>Connected crawled pages</span>{item.connectedPages.map((page) => page.sourceUrl ? <a href={page.sourceUrl} target="_blank" rel="noreferrer" key={page.sourceUrl}>{page.label} ↗</a> : <span key={page.label}>{page.label}</span>)}</div>}</div>
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Official site <span aria-hidden="true">↗</span></a>}
        </article>)}
        {!loading && result.items.length === 0 && <p className={styles.message}>No directory entries match that search.</p>}
      </div>
      <div className={styles.footer}><span>{loading ? "Loading directory…" : `Showing ${result.items.length.toLocaleString()} of ${result.total.toLocaleString()} records`}</span>{result.items.length < result.total && <button type="button" disabled={loading} onClick={() => void load(offset + 20)}>Load more</button>}</div>
    </>}
  </section>;
}
