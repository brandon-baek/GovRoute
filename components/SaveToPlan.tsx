"use client";
import Link from "next/link";
import {useState} from "react";
import type {Journey} from "@/lib/schema";
import {addPlanGuide,useActionPlan} from "@/lib/plan-store";
export function SaveToPlan({journey}:{journey:Journey}){
 const {plan}=useActionPlan();const saved=plan.guides.some(g=>g.journey.id===journey.id);const [message,setMessage]=useState("");const [saving,setSaving]=useState(false);
 return <div className="save-to-plan"><button type="button" disabled={saving} onClick={async()=>{setSaving(true);try{await addPlanGuide(journey);setMessage("Saved in this browser. Your plan combines steps, preparation and personal milestones.");}catch(error){setMessage(error instanceof Error?error.message:"The guide could not be saved.");}finally{setSaving(false);}}}>{saving?"Saving…":saved?"Update saved guide":"Add to my action plan"}</button>{saved&&<Link href="/plan">Open my plan →</Link>}<p aria-live="polite">{message}</p></div>;
}
