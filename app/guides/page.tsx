import type { Metadata } from "next";
import { journeys } from "@/data/curated/journeys";
import { discoveredGuides } from "@/lib/discovered-guides";
import { GuideDirectory } from "@/components/GuideDirectory";
import { GUIDE_GROUPS, type GuideGroupId } from "@/lib/guide-groups";
export const metadata: Metadata = { title: "Government pathways" };
export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  const initialGroup: GuideGroupId = GUIDE_GROUPS.find((item) => item.id === group)?.id ?? "identity-civic";
  return <div className="page-shell shell"><header className="page-intro"><p className="eyebrow">Government pathways</p><h1>Know the process.<br />Take the next step.</h1><p>Find ordered steps and official starting points for documents, driving, benefits, business, and everyday government tasks.</p></header><GuideDirectory guides={journeys} discovered={discoveredGuides} initialGroup={initialGroup} /></div>;
}
