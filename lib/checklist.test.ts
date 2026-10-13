import { describe,expect,it } from "vitest";
import { restoreChecklist,toggleStep } from "./checklist";
const steps=[{id:"plates",title:"Surrender plates",detail:"",sourceIds:["official"]},{id:"insurance",title:"Change insurance",detail:"",sourceIds:["official"],dependsOn:["plates"]},{id:"finish",title:"Finish",detail:"",sourceIds:["official"],dependsOn:["insurance"]}];
describe("dependency-aware checklist progress",()=>{
  it("cannot complete insurance before plate surrender",()=>{expect(toggleStep(steps,[],"insurance")).toEqual([]);});
  it("clears dependent steps when a prerequisite is reopened",()=>{expect(toggleStep(steps,["plates","insurance","finish"],"plates")).toEqual([]);});
  it("ignores corrupted saved progress and inconsistent prerequisites",()=>{expect(restoreChecklist(steps,["insurance","missing"])).toEqual([]);expect(restoreChecklist(steps,["plates","insurance"])).toEqual(["plates","insurance"]);expect(restoreChecklist(steps,{})).toEqual([]);});
});
