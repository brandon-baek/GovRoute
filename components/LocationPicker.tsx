"use client";

import { useState } from "react";
import type { Place, PlaceContext } from "@/lib/place-registry";

type Candidate = { matchedAddress: string; context: PlaceContext };
export function LocationPicker({ state, onChange }: { state: string; onChange: (ids: string[], label: string, stateCode?: string) => void }) {
  const [mode, setMode] = useState<"place" | "address">("place");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");

  async function search() {
    if (loading || query.trim().length < (mode === "place" ? 2 : 8)) return;
    setLoading(true); setPlaces([]); setCandidates([]); setMessage("");
    try {
      const response = mode === "place"
        ? await fetch(`/api/places?${new URLSearchParams({ q: query.trim(), ...(state ? { state } : {}) })}`)
        : await fetch("/api/location/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: query.trim() }) });
      const data = await response.json();
      if (data.places) { setPlaces(data.places); if (!data.places.length) setMessage("No matching place was found. Try another name or continue with your state."); }
      else if (data.candidates) { setCandidates(data.candidates); setMessage(data.message); }
      else setMessage(data.message ?? "Location search is unavailable.");
    } catch { setMessage("Location search is unavailable. You can continue with your state."); }
    finally { setLoading(false); }
  }

  function select(ids: string[], label: string, code?: string) {
    setSelected(label); setPlaces([]); setCandidates([]); setQuery(""); setMessage("");
    onChange(ids, label, code);
  }

  return <details className="location-refinement">
    <summary>{selected ? `Location: ${selected}` : "Add a community or address for local processes"}</summary>
    <div className="location-refinement__body">
      <div className="location-mode" aria-label="Location search type">
        <button type="button" aria-pressed={mode === "place"} onClick={() => { setMode("place"); setQuery(""); setMessage(""); setCandidates([]); }}>Community</button>
        <button type="button" aria-pressed={mode === "address"} onClick={() => { setMode("address"); setQuery(""); setMessage(""); setPlaces([]); }}>Street address</button>
      </div>
      <label htmlFor="location-query">{mode === "place" ? "City, town, or unincorporated community" : "Complete US street address"}</label>
      <div className="location-query">
        <input id="location-query" value={query} maxLength={mode === "place" ? 100 : 240} onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "place" ? "Search a place name" : "Street, city, state, ZIP"} autoComplete="off"
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
        <button type="button" disabled={loading || query.trim().length < (mode === "place" ? 2 : 8)} onClick={() => void search()}>{loading ? "Looking up…" : "Look up"}</button>
      </div>
      {mode === "address" && <p className="privacy-note">Your address is sent to the US Census geocoder for this lookup. Govroute does not save it or send it to the AI router. Address matches do not verify parcel boundaries.</p>}
      <div aria-live="polite">
        {message && <p>{message}</p>}
        {places.length > 0 && <ul className="place-options">{places.map((place) => <li key={`${place.id}:${place.matched_name}`}>
          <button type="button" onClick={() => select([place.id], `${place.name}${place.state_code ? `, ${place.state_code}` : ""}`, place.state_code ?? undefined)}>
            <strong>{place.matched_name ?? place.name}</strong><span>{place.state_code} · {place.kind.replaceAll("_", " ")}{place.matched_name_status === "unofficial" ? " · Unofficial name" : ""}</span>
          </button></li>)}</ul>}
        {candidates.length > 0 && <ul className="place-options">{candidates.map((candidate, index) => <li key={index}><button type="button"
          disabled={!candidate.context.places.length}
          onClick={() => select(candidate.context.places.map((place) => place.id), "Address area confirmed", candidate.context.places.find((place) => place.kind === "state")?.state_code ?? undefined)}>
          <strong>{candidate.matchedAddress}</strong><span>{candidate.context.places.length ? "Use this address area" : "Location registry is not available for this match"}</span>
        </button></li>)}</ul>}
      </div>
      {selected && <button className="location-clear" type="button" onClick={() => select([], "")}>Clear local area</button>}
    </div>
  </details>;
}
