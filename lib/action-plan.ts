import { journeySchema, type Journey } from "./schema";
import { buildMovePlan, type MovePlan } from "./moving";

export type SavedGuide = { journey: Journey; fingerprint: string; savedAt: string };
export type ActionPlan = { version: 1; title: string; guides: SavedGuide[]; completed: string[]; prepared: string[]; dates: Record<string,string> };
export type PlanStep = { key: string; guideId: string; guideTitle: string; step: Journey["steps"][number]; sources: Journey["sources"]; blockedBy: string[]; done: boolean; date?: string };
export const planStorageKey="govroute:action-plan:v1";
export const emptyPlan=():ActionPlan=>({version:1,title:"My government action plan",guides:[],completed:[],prepared:[],dates:{}});
export const stepKey=(guideId:string,stepId:string)=>encodeURIComponent(guideId)+"/"+encodeURIComponent(stepId);
export function validDate(value:string) {return /^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;}
function https(value:string){const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)throw new Error("Saved sources must use public HTTPS links.");}
function validateJourney(value:unknown):Journey {
  const journey=journeySchema.parse(value);
  if(!validDate(journey.reviewedAt))throw new Error("Invalid guide review date.");
  if(journey.steps.length>80||journey.sources.length>80||journey.title.length>300||journey.summary.length>3000)throw new Error("Guide exceeds the saved-plan limits.");
  if(new Set(journey.steps.map(s=>s.id)).size!==journey.steps.length||new Set(journey.sources.map(s=>s.id)).size!==journey.sources.length)throw new Error("Duplicate guide identities.");
  const before=new Set<string>();const sources=new Set(journey.sources.map(s=>s.id));
  for(const step of journey.steps){if(step.dependsOn?.some(id=>!before.has(id)))throw new Error("Invalid or cyclic step dependency.");if(step.sourceIds.some(id=>!sources.has(id)))throw new Error("A step is missing its source.");before.add(step.id);if(step.action)https(step.action.url);}
  for(const source of journey.sources)https(source.url);if(journey.officialAction)https(journey.officialAction.url);
  return journey;
}
export function parsePlan(value:unknown):ActionPlan {
  if(!value||typeof value!=="object")throw new Error("This is not a GovRoute action plan.");
  const p=value as Partial<ActionPlan>;
  if(p.version!==1||typeof p.title!=="string"||p.title.length>100||!Array.isArray(p.guides)||p.guides.length>12||!Array.isArray(p.completed)||p.completed.length>960||!p.dates||typeof p.dates!=="object"||Array.isArray(p.dates)||Object.keys(p.dates).length>960)throw new Error("Invalid action plan format or size.");
  const guides=p.guides.map(item=>{if(!item||typeof item!=="object"||typeof item.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(item.fingerprint)||typeof item.savedAt!=="string"||!Number.isFinite(Date.parse(item.savedAt)))throw new Error("Invalid saved-guide record.");return {journey:validateJourney(item.journey),fingerprint:item.fingerprint,savedAt:item.savedAt};});
  if(new Set(guides.map(g=>g.journey.id)).size!==guides.length)throw new Error("Duplicate saved guides.");
  const keys=new Set(guides.flatMap(g=>g.journey.steps.map(s=>stepKey(g.journey.id,s.id))));
  const dates:Record<string,string>={};for(const [key,date] of Object.entries(p.dates)){if(!keys.has(key)||typeof date!=="string"||!validDate(date))throw new Error("Invalid milestone date.");dates[key]=date;}
  const plan:ActionPlan={version:1,title:p.title,guides,completed:[],prepared:[],dates};
  if(p.prepared!==undefined&&(!Array.isArray(p.prepared)||p.prepared.length>960||p.prepared.some(k=>typeof k!=="string"||k.length>3000)))throw new Error("Invalid preparation checklist.");
  const preparation=new Set(preparationPacket(plan).map(item=>item.key));plan.prepared=(p.prepared??[]).filter(k=>preparation.has(k));
  for(const key of p.completed){if(typeof key!=="string"||!keys.has(key))throw new Error("Unknown completed step.");}
  // Restore in dependency order, discarding impossible completion states.
  for(const item of guides)for(const step of item.journey.steps){const key=stepKey(item.journey.id,step.id);if(p.completed.includes(key)&&!step.dependsOn?.some(id=>!plan.completed.includes(stepKey(item.journey.id,id))))plan.completed.push(key);}
  return plan;
}
function factualVersion(j:Journey){return {id:j.id,title:j.title,summary:j.summary,eligibility:j.eligibility??[],scopeNote:j.scopeNote??"",serviceArea:j.serviceArea??"",coverageLevel:j.coverageLevel??"procedure",officialAction:j.officialAction??null,steps:j.steps.map(s=>({id:s.id,title:s.title,detail:s.detail,sourceIds:[...s.sourceIds].sort(),requirements:s.requirements??[],fees:s.fees??[],deadlines:s.deadlines??[],dependsOn:[...(s.dependsOn??[])].sort(),action:s.action?{label:s.action.label,url:s.action.url}:null,caution:s.caution??""})),sources:j.sources.map(s=>({id:s.id,url:s.url,title:s.title,publisher:s.publisher})).sort((a,b)=>a.id.localeCompare(b.id))};}
export async function fingerprintJourney(journey:Journey) {const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(factualVersion(journey))));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");}
export async function saveGuide(plan:ActionPlan,journey:Journey):Promise<ActionPlan>{
  const checked=validateJourney(journey);const fingerprint=await fingerprintJourney(checked);const old=plan.guides.find(g=>g.journey.id===checked.id);
  if(!old&&plan.guides.length>=12)throw new Error("This plan already has 12 guides. Remove one before adding another.");
  const entry={journey:checked,fingerprint,savedAt:new Date().toISOString()};
  const guides=old?plan.guides.map(g=>g.journey.id===checked.id?entry:g):[...plan.guides,entry];
  const changed=old&&old.fingerprint!==fingerprint;const valid=new Set(checked.steps.map(s=>stepKey(checked.id,s.id)));
  return {...plan,guides,completed:changed?plan.completed.filter(k=>!k.startsWith(encodeURIComponent(checked.id)+"/")):plan.completed,dates:Object.fromEntries(Object.entries(plan.dates).filter(([key])=>!key.startsWith(encodeURIComponent(checked.id)+"/")||valid.has(key)))};
}
export function planSteps(plan:ActionPlan):PlanStep[]{return plan.guides.flatMap(({journey})=>journey.steps.map(step=>{const key=stepKey(journey.id,step.id);return {key,guideId:journey.id,guideTitle:journey.title,step,sources:journey.sources.filter(s=>step.sourceIds.includes(s.id)),blockedBy:(step.dependsOn??[]).filter(id=>!plan.completed.includes(stepKey(journey.id,id))).map(id=>journey.steps.find(s=>s.id===id)?.title??id),done:plan.completed.includes(key),date:plan.dates[key]};}));}
export function togglePlanStep(plan:ActionPlan,key:string):ActionPlan {
  const steps=planSteps(plan);const item=steps.find(s=>s.key===key);if(!item)return plan;
  if(!item.done){if(item.blockedBy.length)return plan;return {...plan,completed:[...plan.completed,key]};}
  const done=new Set(plan.completed);done.delete(key);let changed=true;
  while(changed){changed=false;for(const {journey} of plan.guides)for(const step of journey.steps){const child=stepKey(journey.id,step.id);if(done.has(child)&&step.dependsOn?.some(id=>!done.has(stepKey(journey.id,id)))){done.delete(child);changed=true;}}}
  return {...plan,completed:[...done]};
}
export function preparationPacket(plan:ActionPlan){
  const map=new Map<string,{key:string;text:string;usedBy:string[]}>();
  for(const {journey} of plan.guides)for(const step of journey.steps)for(const text of step.requirements??[]){const key=text.toLowerCase().replace(/[.,;:]$/g,"").replace(/\s+/g," ").trim();const row=map.get(key)??{key,text,usedBy:[]};if(!row.usedBy.includes(journey.title))row.usedBy.push(journey.title);map.set(key,row);}
  return [...map.values()];
}
export function guideChanges(a:Journey,b:Journey){const changes:string[]=[];if(JSON.stringify(a.steps.map(s=>({id:s.id,title:s.title,detail:s.detail,dependsOn:s.dependsOn})))!==JSON.stringify(b.steps.map(s=>({id:s.id,title:s.title,detail:s.detail,dependsOn:s.dependsOn}))))changes.push("Instructions or order");for(const [key,label] of [["requirements","Preparation"],["fees","Fees"],["deadlines","Timing"]] as const)if(JSON.stringify(a.steps.map(s=>s[key]??[]))!==JSON.stringify(b.steps.map(s=>s[key]??[])))changes.push(label);if(JSON.stringify(a.sources.map(s=>s.url).sort())!==JSON.stringify(b.sources.map(s=>s.url).sort()))changes.push("Sources");if(JSON.stringify(a.eligibility)!==JSON.stringify(b.eligibility)||a.scopeNote!==b.scopeNote||a.serviceArea!==b.serviceArea)changes.push("Eligibility or scope");return changes;}
export function moveJourney(from:string,to:string,vehicle:boolean,now=new Date()):Journey|null {
  const plan:MovePlan|null=buildMovePlan(from,to,vehicle,now);if(!plan)return null;
  const urls=[...new Set(plan.steps.map(s=>s.url))];
  return {id:`move-${from.toUpperCase()}-${to.toUpperCase()}-${vehicle?"vehicle":"no-vehicle"}`,slug:"",title:plan.title+" moving checklist",summary:"Departure and arrival tasks combined from the interstate planner. Confirm service areas, exceptions and current requirements with each agency.",category:"Moving between states",jurisdiction:"federal-and-state",audience:["People planning an interstate move"],aliases:[],reviewStatus:plan.reviewDue||!plan.detailed?"review-due":"verified",reviewedAt:plan.reviewedAt,coverageLevel:plan.steps.every(s=>s.checkedAt)?"procedure":"official-handoff",scopeNote:plan.detailed?"Checked destination guidance is combined with departure planning questions where requirements remain unreviewed.":"This destination has limited coverage. These are agency handoffs and planning questions, not verified local requirements.",steps:plan.steps.map(s=>({id:s.id,title:s.title,detail:s.detail,sourceIds:["move-source-"+urls.indexOf(s.url)],dependsOn:s.dependsOn,deadlines:s.deadline?[s.deadline]:undefined,action:{label:s.sourceLabel,url:s.url}})),sources:urls.map((url,index)=>({id:"move-source-"+index,title:plan.steps.find(s=>s.url===url)!.sourceLabel,url,publisher:plan.steps.find(s=>s.url===url)!.jurisdiction,lastChecked:plan.steps.find(s=>s.url===url)?.checkedAt??"Not reviewed"}))};
}

export async function verifyPlanSnapshots(plan:ActionPlan){const results=await Promise.all(plan.guides.map(async g=>(await fingerprintJourney(g.journey))===g.fingerprint));if(results.some(ok=>!ok))throw new Error("A saved-guide snapshot failed its version check. Export the original plan again.");return plan;}
