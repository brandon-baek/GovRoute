import type { Journey } from "@/lib/schema";
export type SourceCheck={id:string;status:"indexed"|"unchanged"|"unavailable"|"not-checked";checkedAt:string|null;changedAt?:string|null};
export function applySourceChecks(journey:Journey,checks:SourceCheck[]):Journey {
  const byId=new Map(checks.map(check=>[check.id,check]));
  const reviewEnd=Date.parse(journey.reviewedAt+"T00:00:00Z")+86400000;
  const changed=checks.some(check=>check.changedAt && Date.parse(check.changedAt)>=reviewEnd);
  return {...journey,sources:journey.sources.map(source=>{const check=byId.get(source.id);return check?{...source,indexStatus:check.status,indexCheckedAt:check.checkedAt}:source;}),
    ...(changed?{reviewStatus:"review-due" as const,reviewNote:"An indexed source changed after the last instruction review. Confirm current requirements at the official source."}:{})};
}
