"use client";
import {useMemo,useSyncExternalStore} from "react";
import {emptyPlan,parsePlan,planStorageKey,saveGuide,type ActionPlan} from "./action-plan";
import type {Journey} from "./schema";
const event="govroute:plan-updated";
function raw(){try{return localStorage.getItem(planStorageKey);}catch{return null;}}
function subscribe(callback:()=>void){window.addEventListener("storage",callback);window.addEventListener(event,callback);return()=>{window.removeEventListener("storage",callback);window.removeEventListener(event,callback);};}
export function readPlan():ActionPlan {const text=raw();return text?parsePlan(JSON.parse(text)):emptyPlan();}
export function writePlan(plan:ActionPlan){const checked=parsePlan(plan);try{localStorage.setItem(planStorageKey,JSON.stringify(checked));}catch{throw new Error("Your browser could not save this plan. Enable browser storage or export a copy.");}window.dispatchEvent(new Event(event));}
export async function addPlanGuide(journey:Journey){
  // Hashing is asynchronous; read again before saving to preserve other changes.
  const original=readPlan();const changed=await saveGuide(original,journey);const latest=readPlan();
  if(JSON.stringify(latest)!==JSON.stringify(original)){writePlan(await saveGuide(latest,journey));}else writePlan(changed);
}
export function useActionPlan(){const text=useSyncExternalStore(subscribe,raw,()=>null);return useMemo(()=>{try{return {plan:text?parsePlan(JSON.parse(text)):emptyPlan(),error:"",loaded:text!==null};}catch{return {plan:emptyPlan(),error:"The saved plan could not be read. Import a valid backup or start a new plan.",loaded:false};}},[text]);}
