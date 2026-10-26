import type {Metadata} from "next";
import {ActionPlanWorkspace} from "@/components/ActionPlanWorkspace";
export const metadata:Metadata={title:"My action plan",description:"Combine government guides into a private action plan, preparation packet and personal milestone calendar."};
export default function PlanPage(){return <div className="shell plan-page"><header className="page-intro"><p className="eyebrow">Your civic workspace</p><h1>One plan. A clear next action.</h1><p>Bring your government tasks together. See prerequisites, prepare shared documents and set your own milestones. Your plan stays in this browser.</p></header><ActionPlanWorkspace/></div>;}
