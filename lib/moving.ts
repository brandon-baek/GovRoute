import { stateByCode } from "@/lib/jurisdictions";

export type MoveStep = { id: string; title: string; detail: string; jurisdiction: string; url: string; sourceLabel: string; deadline?: string; checkedAt?: string; dependsOn?: string[] };
export type MovePlan = { title: string; detailed: boolean; reviewDue: boolean; reviewedAt: string; steps: MoveStep[] };
const checkedAt = "2026-10-09";
const ca = "https://www.dmv.ca.gov/portal/driver-education-and-safety/special-interest-driver-guides/new-to-california/";
const tx = "https://www.txdmv.gov/motorists/new-to-texas";
const txLicense = "https://www.dps.texas.gov/section/driver-license/moving-texas-guide-driver-licenses-and-ids";
const ny = "https://dmv.ny.gov/more-info/moving-to-or-from-new-york-state";

export function buildMovePlan(from: string, to: string, vehicle: boolean, now = new Date()): MovePlan | null {
  from=from.toUpperCase(); to=to.toUpperCase();
  const origin = stateByCode(from);
  const destination = stateByCode(to);
  if (!origin || !destination || from === to) return null;
  const detailed = ["CA", "TX", "NY"].includes(to);
  const source = to === "CA" ? ca : to === "TX" ? tx : to === "NY" ? ny : destination.directoryUrl;
  const steps: MoveStep[] = [{
    id: "residency", title: "Check when your new state's resident rules apply",
    detail: "Open the official resident guidance and check how it treats your situation. Temporary students, military families, and other exceptions may follow different rules. Confirm the date from which any deadline runs.",
    jurisdiction: destination.name, url: source, sourceLabel: detailed ? "New-resident guidance" : "Official state directory — find resident guidance", checkedAt: detailed ? checkedAt : undefined
  }];
  if (vehicle) {
    steps.push({ id: "departure", title: "Check your old state's plate and insurance rules before changing coverage",
      detail: from === "NY" ? "New York says to surrender its plates and registration before replacing New York insurance with out-of-state coverage; otherwise your registration and possibly your license can be suspended." : "Ask your current motor-vehicle agency whether you need to return plates, notify it of the move, or cancel registration. Confirm the order with the agency and insurer before ending coverage.",
      jurisdiction: origin.name, url: from === "NY" ? ny : origin.motorUrl,
      sourceLabel: from === "NY" ? "New York DMV moving guidance" : "Origin agency — confirm departure requirements", checkedAt: from === "NY" ? checkedAt : undefined });
    steps.push({ id: "vehicle-prep", title: to === "TX" ? "Arrange insurance and check your county's emissions requirements" : "Check insurance, title, and inspection requirements",
      detail: to === "TX" ? "Texas requires proof of insurance for registration. A passing emissions inspection is required in the listed emissions counties. Check the official county list and vehicle exceptions before registering." : to === "NY" ? "A vehicle registered in New York must have New York insurance; out-of-state coverage is not accepted. Review the out-of-state vehicle instructions for documents and inspection requirements." : "Use the official vehicle instructions to confirm insurance evidence, title or registration documents, and any inspection or emissions requirements for your vehicle and location.",
      jurisdiction: destination.name, url: source, sourceLabel: detailed ? "Official vehicle guidance" : "Official state directory — find vehicle requirements", dependsOn: ["residency", "departure"], checkedAt: detailed ? checkedAt : undefined });
    steps.push({ id: "registration", title: `Register your vehicle in ${destination.name}`,
      detail: to === "TX" ? "Visit your county tax assessor-collector with your insurance card and proof of ownership, such as your previous registration or title. Complete Form 130-U; check local appointment options and current fees." : to === "CA" ? "Follow the DMV's out-of-state vehicle registration route and its document checklist. Confirm current fees and any vehicle-specific requirements." : to === "NY" ? "Use New York DMV's out-of-state registration process and check the documents for your ownership situation." : "Find the new-resident vehicle registration process in the official directory. This state does not yet have a reviewed registration checklist here; confirm all documents and deadlines with the agency.",
      jurisdiction: destination.name, url: to === "NY" ? "https://dmv.ny.gov/registration/register-an-out-of-state-vehicle" : source,
      sourceLabel: to === "TX" ? "TxDMV — county registration" : "Official registration guidance", dependsOn: ["vehicle-prep"],
      deadline: to === "TX" ? "Within 30 days of moving to Texas" : to === "CA" ? "Within 20 days of becoming a resident or bringing the vehicle into California" : to === "NY" ? "Within 30 days of becoming a resident" : undefined, checkedAt: detailed ? checkedAt : undefined });
  }
  steps.push({ id: "license", title: `Check your driver license transfer in ${destination.name}`,
    detail: to === "TX" ? "Driver licenses are issued by Texas DPS, separately from TxDMV. Review DPS’s transfer instructions and required documents; a valid out-of-state license must be surrendered. DPS requires vehicle owners to handle Texas registration before the license application; check the registration-evidence rules and any exemptions." : to === "NY" ? "Review exchange eligibility and prepare the required documents. Exchange is in person and includes a vision test, surrendering your out-of-state license, and a fee." : to === "CA" ? "If you become a California resident and drive, apply for a California driver license using the DMV's new-resident route. Check current documents, tests, and timing." : "Find the driver licensing agency and its new-resident transfer instructions. Do not assume the vehicle-registration office also issues driver licenses. Confirm deadlines and appointment requirements on the official site.",
    jurisdiction: destination.name, url: to === "TX" ? txLicense : to === "NY" ? "https://dmv.ny.gov/driver-license/exchange-out-of-state-driver-license" : source,
    sourceLabel: to === "TX" ? "Texas DPS — license transfer" : "Official license guidance", dependsOn: to === "TX" && vehicle ? ["residency", "registration"] : ["residency"],
    deadline: to === "TX" ? "Within 90 days of moving to Texas" : to === "NY" ? "Within 30 days of becoming a resident" : undefined, checkedAt: detailed ? checkedAt : undefined });
  return { title: `${origin.name} to ${destination.name}`, detailed, reviewDue: now.getTime()-Date.parse(checkedAt+"T00:00:00Z")>30*86400000, reviewedAt:checkedAt, steps };
}
