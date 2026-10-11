import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="page-shell shell article-page">
      <header className="page-intro"><p className="eyebrow">Privacy</p><h1>govroute does not need your identifying numbers.</h1><p>Describe the situation, not the private record.</p></header>
      <section><h2>Do not enter</h2><p>Do not send Social Security numbers, bank or payment card numbers, passport numbers, driver’s license numbers, immigration file numbers, passwords, or full copies of government notices.</p></section>
      <section><h2>Request handling</h2><p>The application does not persist chat messages. The server uses the text long enough to identify a graph route and return a response. Production hosting should keep request-body logging disabled. Free routing is the default. If the operator explicitly enables paid AI routing, ambiguous requests and a shortlist of guides may be sent to OpenAI for intent classification.</p></section>
      <section><h2>Site analytics</h2><p>govroute uses Vercel Web Analytics to understand page views and broad usage trends. Vercel says its analytics use no third-party cookies and provide aggregated, anonymous statistics. The data may include the page viewed, referring page, approximate location, and device or browser type. <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noreferrer">Learn how Vercel handles analytics data</a>.</p></section>
      <section><h2>Official transactions</h2><p>govroute sends you to the responsible government website when personal information or an application is required. Check the domain before entering sensitive data.</p></section>
    </div>
  );
}
