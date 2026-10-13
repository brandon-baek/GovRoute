import type { JourneyStep } from "@/lib/schema";
export function toggleStep(steps: JourneyStep[], completed: string[], id: string) {
  const step=steps.find(item=>item.id===id); if(!step) return completed;
  const next=new Set(completed);
  if (!next.has(id)) {
    if (step.dependsOn?.some(parent=>!next.has(parent))) return completed;
    next.add(id);
  } else {
    next.delete(id);
    let changed=true;
    while(changed) {changed=false;for(const item of steps) if(next.has(item.id) && item.dependsOn?.some(parent=>!next.has(parent))) {next.delete(item.id);changed=true;}}
  }
  return steps.filter(item=>next.has(item.id)).map(item=>item.id);
}
export function restoreChecklist(steps:JourneyStep[],value:unknown) {
  if(!Array.isArray(value)) return [];
  let completed:string[]=[];
  for(const step of steps) if(value.includes(step.id)) completed=toggleStep(steps,completed,step.id);
  return completed;
}
