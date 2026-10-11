import Link from "next/link";
import { GuideSearch } from "@/components/GuideSearch";
import { journeys } from "@/data/curated/journeys";
import { ArrowIcon } from "@/components/icons";

const starts = [
  { number: "01", title: "Passports & identity", detail: "Apply, renew, replace, or update a document.", href: "/guides/apply-for-or-renew-a-passport" },
  { number: "02", title: "Driving & vehicles", detail: "Find your license, registration, and state transfer steps.", href: "/guides?group=travel-moving" },
  { number: "03", title: "Benefits & support", detail: "Understand applications, required evidence, and follow-up.", href: "/guides?group=money-benefits" },
  { number: "04", title: "Business & permits", detail: "Find registration and permit pathways for your activity.", href: "/guides?group=work-learning" }
];

export default function HomePage() {
  return <>
    <section className="hero shell" id="ask">
      <div className="hero__copy">
        <p className="eyebrow">Government pathways, made understandable.</p>
        <h1>Your next step.<br />Made clear.</h1>
        <p>Tell us what you need to do. Find the right process, what to prepare, and where to go next—with official sources along the way.</p>
        <p className="hero-location-note">Start with the task. Add your location when the rules depend on where you live.</p>
        <div className="hero-proof"><span>No account required</span><span>Official source links</span></div>
      </div>
      <GuideSearch />
    </section>
    <section className="trust-line"><div className="shell"><span>Independent public-service guide.</span><p>Sources and coverage are shown with each pathway.</p></div></section>
    <section className="featured shell">
      <div className="section-heading"><div><p className="section-label">A place to start</p><h2>Everyday tasks. Clear routes.</h2></div><Link href="/guides">Browse pathways <ArrowIcon /></Link></div>
      <div className="hub-starts">{starts.map((item) => <Link key={item.number} href={item.href}><span>{item.number}</span><h3>{item.title}</h3><p>{item.detail}</p><span className="hub-starts__action">Find a pathway <ArrowIcon /></span></Link>)}</div>
    </section>
    <section className="hub-method shell"><p className="section-label">From a question to a next step</p><div>
      <article><span>01 / Find your route</span><h2>The process that fits.</h2><p>Your task and location help identify the relevant agency and pathway.</p></article>
      <article><span>02 / Get prepared</span><h2>Know what you’ll need.</h2><p>Follow ordered steps and check the required documents, eligibility, fees, and timing at the official source.</p></article>
      <article><span>03 / Take the next step</span><h2>Go to the right place.</h2><p>Use direct official links to apply, book, submit, or check your progress.</p></article>
    </div></section>
    <section className="hub-coverage shell"><div><p className="section-label">Growing with evidence</p><h2>The right rules for the right place.</h2><p>Current pathways include federal tasks and a limited set of state and local processes. We show gaps as we connect more communities, authorities, and official procedures.</p><p>{journeys.length} curated pathways are currently available. A location record alone does not mean every process there is covered.</p></div><Link href="/data">See sources & coverage <ArrowIcon /></Link></section>
  </>;
}
