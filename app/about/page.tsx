import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="page-shell shell article-page">
      <header className="page-intro"><p className="eyebrow">About govroute</p><h1>Built around the task, not the agency chart.</h1><p>Government services are usually organized by institution. People arrive with a situation. govroute connects the two.</p></header>
      <section><h2>What it does</h2><p>govroute focuses on state and local services, including processes that cross state lines. Its moving planner brings departure and arrival tasks together, while federal routes remain available as supporting guides. It offers reviewed step-by-step routes where available and clearly marked discovered guides everywhere the crawler has found a potential pathway.</p></section>
      <section><h2>What it does not do</h2><p>govroute does not determine eligibility, submit applications, collect sensitive identifiers, or provide legal advice. It will say when it does not have a reliable route.</p></section>
      <section><h2>Why the graph matters</h2><p>The graph shows reviewed and discovered guides together with their steps, official pages, and publishers. Every guide can be traced to its evidence and status instead of appearing from an unexplained answer generator.</p></section>
    </div>
  );
}
