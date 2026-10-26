import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ActionPlanWorkspace} from "@/components/ActionPlanWorkspace";
import {SaveToPlan} from "@/components/SaveToPlan";
import {processJourneys} from "@/lib/process-catalog";
describe("private action workspace rendering",()=>{
 it("explains local storage and connects an empty plan to real guide and move flows",()=>{
  const html=renderToStaticMarkup(createElement(ActionPlanWorkspace));expect(html).toContain("Saved only in this browser");expect(html).toContain('href="/guides"');expect(html).toContain('href="/moving"');expect(html).toContain("Export plan");
 });
 it("offers saving a real published guide without claiming server sync",()=>{
  const html=renderToStaticMarkup(createElement(SaveToPlan,{journey:processJourneys[0]}));expect(html).toContain("Add to my action plan");expect(html).not.toContain("cloud sync");
 });
});
