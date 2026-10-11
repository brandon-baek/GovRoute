import type { Journey } from "@/lib/schema";

// A successful HTTP fetch is not a new review of the instructions.
export function withSourceFreshness(journey:Journey,now=new Date(),days=30):Journey {
  if (journey.reviewStatus!=="verified") return journey;
  const reviewed=Date.parse(journey.reviewedAt+"T00:00:00Z");
  const sourceDates=journey.sources.map(source=>Date.parse(source.lastChecked+"T00:00:00Z"));
  const oldest=Math.min(reviewed,...sourceDates);
  const due=!Number.isFinite(oldest) || oldest>now.getTime() || now.getTime()-oldest>days*86400000;
  return due ? {...journey,reviewStatus:"review-due"} : journey;
}
