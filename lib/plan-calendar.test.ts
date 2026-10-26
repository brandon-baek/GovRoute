import {describe,it,expect} from "vitest";
import {emptyPlan,saveGuide,stepKey} from "./action-plan";
import {escapeCalendar,foldCalendar,planCalendar} from "./plan-calendar";
import {processJourneys} from "./process-catalog";
describe("personal calendar milestone export",()=>{
 it("exports all-day personal targets with source evidence, excluding completed steps",async()=>{
  const j=processJourneys.find(j=>j.id==="journey-passport-apply")!;const plan=await saveGuide(emptyPlan(),j);const key=stepKey(j.id,j.steps[0].id);plan.dates[key]="2026-11-03";
  const calendar=planCalendar(plan,new Date("2026-10-26T00:00:00Z"));expect(calendar).toContain("DTSTART;VALUE=DATE:20261103");expect(calendar).toContain("Personal target date");expect(calendar).toContain("not an official government deadline");expect(calendar).toContain("https://travel.state.gov");plan.completed=[key];expect(planCalendar(plan)).not.toContain("BEGIN:VEVENT");
 });
 it("escapes injected calendar properties and folds Unicode at byte boundaries",()=>{
  expect(escapeCalendar("text\r\nBEGIN:VEVENT;bad,field\\")).toBe("text\\nBEGIN:VEVENT\\;bad\\,field\\\\");
  const text="SUMMARY:"+"가".repeat(60);const folded=foldCalendar(text);for(const line of folded.split("\r\n"))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);expect(folded.replaceAll("\r\n ","")).toBe(text);
 });
});
