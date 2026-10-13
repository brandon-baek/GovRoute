import { processPublications } from "@/lib/process-catalog";
import type { Journey } from "@/lib/schema";
import { taskTopics } from "@/lib/task-topics";
export function procedureCoverage(journeys:Journey[]) {
  const ids=new Set(journeys.map(j=>j.id));
  return taskTopics.map(topic=>{
    const records=processPublications.filter(item=>item.topic===topic.id && ids.has(item.journey.id));
    const matching=journeys.filter(j=>records.some(item=>item.journey.id===j.id));
    const status=matching.some(j=>j.reviewStatus==="verified" && j.coverageLevel!=="official-handoff")?"reviewed-procedure":matching.some(j=>j.reviewStatus==="verified")?"official-handoff":matching.length?"review-due":"coverage-gap";
    return {id:topic.id,label:topic.label,status,processes:matching.map(j=>({id:j.id,title:j.title,slug:j.slug,reviewedAt:j.reviewedAt,coverageLevel:j.coverageLevel??"procedure"}))};
  });
}
export type ProcedureCoverage = ReturnType<typeof procedureCoverage>;
