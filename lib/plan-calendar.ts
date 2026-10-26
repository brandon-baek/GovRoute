import {planSteps,validDate,type ActionPlan} from "./action-plan";
export function escapeCalendar(value:string){return value.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");}
export function foldCalendar(line:string){let result="",bytes=0;for(const char of line){const count=new TextEncoder().encode(char).length;if(bytes+count>75){result+="\r\n ";bytes=1;}result+=char;bytes+=count;}return result;}
export function planCalendar(plan:ActionPlan,now=new Date()){
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GovRoute//Personal Milestones//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  for(const item of planSteps(plan).filter(s=>s.date&&!s.done)){
    if(!validDate(item.date!))throw new Error("Invalid milestone date.");
    lines.push("BEGIN:VEVENT","UID:"+encodeURIComponent(item.key)+"@govroute.local","DTSTAMP:"+now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""),"DTSTART;VALUE=DATE:"+item.date!.replace(/-/g,""),"SUMMARY:"+escapeCalendar("GovRoute: "+item.step.title),"DESCRIPTION:"+escapeCalendar("Personal target date, not an official government deadline.\n"+item.guideTitle+"\n"+item.step.detail+"\n"+item.sources.map(s=>s.title+": "+s.url).join("\n")),"END:VEVENT");
  }
  return [...lines,"END:VCALENDAR"].map(foldCalendar).join("\r\n")+"\r\n";
}
