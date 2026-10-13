import Link from "next/link";
import { ArrowIcon } from "@/components/icons";

const scenarios = [
  {
    number: "01",
    label: "A move across state lines",
    title: "One move. Both sides of the checklist.",
    question: "“I’m moving from New York to Texas with my car.”",
    detail: "Bring departure and arrival tasks together. See dependencies and the limits of the checked destination guidance.",
    evidence: ["Origin tasks", "Destination tasks", "Ordered prerequisites"],
    href: "/moving",
    action: "Build a moving checklist"
  },
  {
    number: "02",
    label: "A local property question",
    title: "A place name is only the beginning.",
    question: "“Where do I start with a building permit?”",
    detail: "Check geographic context and reviewed service-area coverage. If a route is missing, see the evidence still needed—not a guessed permit answer.",
    evidence: ["Community context", "County scope", "Coverage gaps"],
    href: "/data#coverage",
    action: "Explore local coverage"
  },
  {
    number: "03",
    label: "A document before a trip",
    title: "Your next step has a source.",
    question: "“How do I apply for or renew a passport?”",
    detail: "Start with an ordered guide, inspect its official sources and review status, and save checklist progress in your browser.",
    evidence: ["Official source links", "Review status", "Printable checklist"],
    href: "/guides/apply-for-or-renew-a-passport",
    action: "See the passport pathway"
  }
];

export function ExampleScenarios() {
  return <section className="scenario-section shell" aria-labelledby="scenario-heading">
    <div className="section-heading"><div><p className="section-label">See it in action</p><h2 id="scenario-heading">Real questions. Different kinds of routes.</h2></div></div>
    <p className="scenario-intro">Illustrative scenarios, not testimonials. Each route shows its own sources, scope, and coverage limits.</p>
    <div className="scenario-grid">{scenarios.map(scenario => <article key={scenario.number}>
      <p className="scenario-label"><span>{scenario.number}</span>{scenario.label}</p>
      <h3>{scenario.title}</h3>
      <blockquote>{scenario.question}</blockquote>
      <p>{scenario.detail}</p>
      <ul aria-label="What this example demonstrates">{scenario.evidence.map(item => <li key={item}>{item}</li>)}</ul>
      <Link href={scenario.href}>{scenario.action}<ArrowIcon /></Link>
    </article>)}</div>
  </section>;
}
