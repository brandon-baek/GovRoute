/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP scenario assertions inspect heterogeneous JSON response contracts. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import Database from "better-sqlite3";

async function main() {
const db=new Database("data/govroute-runtime.db",{readonly:true});
const port=3100,base="http://127.0.0.1:"+port;
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(port)],{env:{...process.env,GOVROUTE_ENABLE_PAID_AI:"false",GOVROUTE_REGISTRY_COMPRESSED:"true",GOVROUTE_REGISTRY_MANIFEST_PATH:"data/govroute-runtime.manifest.json"}});
let logs=""; server.stdout.on("data",chunk=>{logs=(logs+chunk).slice(-12000);});server.stderr.on("data",chunk=>{logs=(logs+chunk).slice(-12000);});
let counter=0;
const results:{scenario:string;status:string;milliseconds:number}[]=[];
async function api(path:string,body?:unknown) {
  const start=performance.now();
  const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json","x-forwarded-for":"192.0.2."+((counter++%250)+1)},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});
  const data=await response.json();
  return {response,data,milliseconds:Math.round(performance.now()-start)};
}
async function record(name:string,path:string,body:unknown|undefined,check:(data:any,response:Response)=>void) {
  const result=await api(path,body);check(result.data,result.response);
  results.push({scenario:name,status:result.data.status??"catalog",milliseconds:result.milliseconds});
  return result.data;
}
try {
  let ready=false;
  for(let i=0;i<80;i++) {
    try { const response=await fetch(base+"/api/processes");if(response.ok){ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,"Production server did not start: "+logs);
  await record("deployed national coverage","/api/places?coverage=true",undefined,(data,response)=>{
    assert.equal(response.status,200);assert.equal(data.status,"available");assert.ok(data.placeCount>200000);
    assert.ok(data.registeredDomainCount>10000);assert.ok(data.linkedDirectoryPlaceCount>1000);
  });
  const states=db.prepare("SELECT id,state_code FROM places WHERE kind='state' AND state_code IS NOT NULL ORDER BY state_code").all() as {id:string;state_code:string}[];
  assert.ok(states.length>=51);
  for(const state of states) {
    const place=db.prepare("SELECT id,name FROM places WHERE state_code=? AND kind IN ('municipality','cdp','county_subdivision') ORDER BY kind,name LIMIT 1").get(state.state_code) as {id:string;name:string}|undefined;
    if (!place) continue;
    const query=new URLSearchParams({q:place.name,state:state.state_code});
    await record("place search in "+state.state_code,"/api/places?"+query,undefined,(data,response)=>{
      assert.equal(response.status,200);assert.equal(data.status,"results");
      assert.ok(data.places.some((row:{id:string})=>row.id===place.id),state.state_code+": missing exact place");
      assert.ok(data.places.every((row:{state_code:string})=>row.state_code===state.state_code));
    });
    await record("federal passport from "+state.state_code,"/api/chat",{message:"How do I renew my passport?",state:state.state_code,placeIds:[place.id]},data=>{
      assert.equal(data.status,"matched");assert.equal(data.journey.jurisdiction,"federal");
      assert.equal(data.provenance.processStorage,"registry-process-catalog");assert.equal(data.journey.steps.length,5);
      const sources=new Set(data.journey.sources.map((source:{id:string})=>source.id));
      for(const step of data.journey.steps) assert.ok(step.sourceIds.every((id:string)=>sources.has(id)));
    });
  }
  await record("indexed government catalog","/api/catalog?collection=domains",undefined,(data,response)=>{
    assert.equal(response.status,200);assert.ok(data.total>10000);assert.ok(data.items.length>0 && data.items.length<=20);
  });
  await record("guide group browsing","/api/guides?group=identity-civic",undefined,(data,response)=>{
    assert.equal(response.status,200);assert.ok(Array.isArray(data.guides));assert.ok(data.guides.length);
  });
  await record("invalid catalog collection","/api/catalog?collection=unknown",undefined,(_,response)=>assert.equal(response.status,400));
  await record("ambiguous Springfield","/api/places?q=Springfield",undefined,data=>{
    assert.equal(data.status,"results");assert.ok(new Set(data.places.map((place:{state_code:string})=>place.state_code)).size>1);
  });
  await record("literal wildcard search","/api/places?q=%25_",undefined,data=>{assert.equal(data.status,"results");assert.equal(data.places.length,0);});
  await record("invalid state","/api/places?q=Oakland&state=ZZ",undefined,(_,response)=>assert.equal(response.status,400));
  const cdp=db.prepare("SELECT id FROM places WHERE kind='cdp' AND state_code='CA' LIMIT 1").get() as {id:string};
  await record("statistical community context","/api/places?id="+encodeURIComponent(cdp.id),undefined,data=>{
    assert.equal(data.status,"matched");assert.equal(data.context.places.find((place:{id:string})=>place.id===cdp.id).government_status,"none");
    assert.ok(!data.context.authorities.some((authority:{id:string})=>authority.id==="authority:"+cdp.id));
  });
  await record("property requires parcel evidence","/api/chat",{message:"Can I build an ADU on my property?",state:"CA",placeIds:[cdp.id]},data=>{
    assert.equal(data.status,"coverage_gap");assert.equal(data.steps.length,3);assert.equal(data.missing.length,3);assert.equal(data.journey,undefined);
  });
  const linked=db.prepare("SELECT place_id FROM domain_places LIMIT 1").get() as {place_id:string};
  await record("local directory referral","/api/local-resources?id="+encodeURIComponent(linked.place_id)+"&q=permit",undefined,data=>{
    assert.equal(data.status,"directory");assert.ok(data.resources.length);
    assert.ok(data.resources.every((row:{reviewStatus:string})=>["directory_only","machine_indexed"].includes(row.reviewStatus)));
  });
  await record("unreviewed local permit","/api/chat",{message:"I need a building permit",placeIds:[linked.place_id]},data=>{
    assert.equal(data.status,"coverage_gap");assert.ok(data.directoryResources.length);assert.equal(data.journey,undefined);
  });
  await record("state-place conflict","/api/chat",{message:"I need a building permit",state:"TX",placeIds:[cdp.id]},data=>assert.equal(data.status,"clarify"));
  await record("mixed valid and invalid places","/api/chat",{message:"I need a building permit",placeIds:[cdp.id,"missing-place"]},data=>assert.equal(data.status,"clarify"));
  await record("free text cannot certify locality","/api/chat",{message:"I need a building permit",state:"CA",locality:"Oakland"},data=>{
    assert.equal(data.status,"coverage_gap");assert.deepEqual(data.directoryResources,[]);
  });
  await record("sensitive identifier","/api/chat",{message:"My SSN is 123-45-6789"},data=>assert.equal(data.status,"blocked"));
  await record("oversized request contract","/api/chat",{message:"x".repeat(9000)},(data,response)=>{assert.equal(response.status,413);assert.deepEqual(data.alternatives,[]);});
  await record("cross-state moving flow","/api/chat",{message:"moving from New York to Texas"},data=>{assert.equal(data.status,"clarify");assert.equal(data.alternatives[0].href,"/moving");});
  await record("CA scoped process catalog","/api/processes?state=CA",undefined,data=>assert.equal(data.processes.length,6));
  await record("TX scoped process catalog","/api/processes?state=TX",undefined,data=>{assert.deepEqual(data.processes.map((journey:{id:string})=>journey.id).sort(),["journey-birth-certificate-start","journey-driver-license-start","journey-irs-ein","journey-passport-apply","journey-tx-license-transfer","journey-voter-registration-start"]);});
  await record("process catalog derives state from selected place","/api/processes?id="+encodeURIComponent(cdp.id),undefined,data=>assert.equal(data.processes.length,6));
  await record("process catalog rejects state-place conflict","/api/processes?state=TX&id="+encodeURIComponent(cdp.id),undefined,(_,response)=>assert.equal(response.status,400));
  await record("process catalog rejects unknown place","/api/processes?id=missing-place",undefined,(_,response)=>assert.equal(response.status,404));
  await record("country process catalog stays federal","/api/processes?id=country%3AUS",undefined,data=>{
    assert.equal(data.processes.length,5);assert.ok(data.processes.every((process:{jurisdiction:string})=>process.jurisdiction==="federal"));
  });
  await record("TX license transfer uses vehicle prerequisites","/api/chat",{message:"transfer out-of-state license to Texas",state:"TX"},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-tx-license-transfer");
    assert.equal(data.provenance.processStorage,"registry-process-catalog");
    assert.deepEqual(data.journey.steps.find((step:{id:string})=>step.id==="visit").dependsOn,["vehicles","documents"]);
    assert.ok(data.journey.steps.every((step:{sourceIds:string[]})=>step.sourceIds.every(id=>data.journey.sources.some((source:{id:string})=>source.id===id))));
  });
  await record("NY plates precede insurance change","/api/chat",{message:"surrender NY plates before canceling insurance",state:"NY"},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-ny-plate-surrender");
    assert.deepEqual(data.journey.steps.at(-1).dependsOn,["return"]);
  });
  const sf=db.prepare("SELECT id FROM places WHERE geoid='0667000' AND kind='municipality'").get() as {id:string};
  const oakland=db.prepare("SELECT id FROM places WHERE geoid='0653000' AND kind='municipality'").get() as {id:string};
  assert.ok(sf && oakland,"Real reviewed and neighboring city scopes must exist");
  await record("SF exact local catalog","/api/processes?id="+encodeURIComponent(sf.id),undefined,data=>{
    assert.equal(data.processes.length,7);
    assert.ok(data.processes.some((journey:{id:string})=>journey.id==="journey-sf-damaged-public-property"));
  });
  await record("SF damaged public property report","/api/chat",{message:"Report damaged public property",placeIds:[sf.id]},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-sf-damaged-public-property");
    assert.equal(data.provenance.processStorage,"registry-process-catalog");
    assert.deepEqual(data.journey.territoryIds,[sf.id]);assert.equal(data.journey.steps.length,3);
    assert.ok(data.journey.sources.every((source:{url:string})=>source.url.startsWith("https://www.sf.gov/")));
  });
  await record("SF broken bench follows local route","/api/chat",{message:"Report a broken bench",state:"CA",placeIds:[sf.id]},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-sf-damaged-public-property");
  });
  for (const [name,body] of [
    ["neighboring city does not inherit SF service",{message:"Report a broken bench",state:"CA",placeIds:[oakland.id]}],
    ["state alone does not certify SF service",{message:"Report a broken bench",state:"CA"}],
    ["typed SF locality does not certify scope",{message:"Report a broken bench",state:"CA",locality:"San Francisco"}],
    ["SF service rejects a different selected state",{message:"Report a broken bench",state:"TX",placeIds:[sf.id]}],
  ] as const) {
    await record(name,"/api/chat",body,data=>{
      assert.notEqual(data.journey?.id,"journey-sf-damaged-public-property");
      assert.equal(data.status,name==="SF service rejects a different selected state"?"clarify":"coverage_gap",name);
    });
  }
  await record("SF property rights still need parcel evidence","/api/chat",{message:"Can I build an ADU on my property?",placeIds:[sf.id]},data=>{
    assert.equal(data.status,"coverage_gap");assert.equal(data.journey,undefined);assert.equal(data.missing.length,3);
  });
  // A geographically varied cohort uses the same runtime boundary adapter.
  const cohort=[
    {name:"La Crescenta-Montrose",state:"CA",kind:"cdp",county:"Los Angeles",permit:"journey-la-county-building-permit"},
    {name:"Altadena",state:"CA",kind:"cdp",county:"Los Angeles",permit:"journey-la-county-building-permit"},
    {name:"White Center",state:"WA",kind:"cdp",county:"King",permit:"journey-king-county-building-permit"},
    {name:"Glendale",state:"CA",kind:"municipality",county:"Los Angeles",permit:undefined},
    {name:"La Cañada Flintridge",state:"CA",kind:"municipality",county:"Los Angeles",permit:undefined},
  ];
  for(const test of cohort) {
    const place=db.prepare("SELECT id FROM places WHERE state_code=? AND kind=? AND name LIKE ? ORDER BY name LIMIT 1").get(test.state,test.kind,test.name+"%") as {id:string}|undefined;
    assert.ok(place,"National cohort place missing: "+test.name);
    await record(test.name+" whole boundary context","/api/location/context?id="+encodeURIComponent(place.id),undefined,(data,response)=>{
      assert.equal(response.status,200);assert.ok(data.context.places.some((p:{kind:string;name:string})=>p.kind==="county" && p.name.startsWith(test.county)),test.name+": county boundary must be confirmed");
      if(test.kind==="cdp") assert.equal(data.context.places.find((p:{id:string})=>p.id===place.id).government_status,"none");
    });
    await record(test.name+" building permit routing","/api/chat",{message:"I need a building permit",state:test.state,placeIds:[place.id]},data=>{
      if(test.permit) {assert.equal(data.status,"matched");assert.equal(data.journey.id,test.permit);assert.equal(data.journey.serviceArea,"unincorporated");}
      else {assert.equal(data.status,"coverage_gap");assert.notEqual(data.journey?.id,"journey-la-county-building-permit");}
    });
    await record(test.name+" visible coverage","/api/coverage?"+new URLSearchParams({id:place.id,state:test.state}),undefined,(data,response)=>{
      assert.equal(response.status,200);assert.equal(data.topics.length,9);const permit=data.topics.find((row:{id:string})=>row.id==="building_permit");
      assert.equal(permit.status,test.permit?"reviewed-procedure":"coverage-gap");
    });
    if(test.kind==="cdp") await record(test.name+" property rights remain unresolved","/api/chat",{message:"Can I build an ADU on my property?",placeIds:[place.id]},data=>{assert.equal(data.status,"coverage_gap");assert.equal(data.journey,undefined);assert.equal(data.missing.length,3);});
  }
  // A published county-library address exercises the user-selected address
  // bridge. Its mailing name is not treated as jurisdiction evidence.
  const publicAddress="2809 Foothill Blvd, La Crescenta, CA 91214";
  await record("public library address resolves to Census context","/api/location/resolve",{address:publicAddress},(data,response)=>{
    assert.equal(response.status,200);assert.equal(data.status,"matched");
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    assert.equal(data.candidates[0].context.precision,"address_range");
    assert.ok(data.candidates[0].context.places.some((p:{geoid?:string;id:string})=>p.id==="census:82:06037"));
  });
  await record("address-selected permit revalidates scope","/api/chat",{message:"I need a building permit",state:"CA",locationAddress:publicAddress},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-la-county-building-permit");
  });
  await record("address coverage uses private POST","/api/coverage",{state:"CA",locationAddress:publicAddress},(data,response)=>{
    assert.equal(response.status,200);assert.equal(data.context.precision,"address_range");
    assert.ok(response.headers.get("cache-control")?.includes("private"));
    assert.equal(data.topics.find((row:{id:string})=>row.id==="building_permit").status,"reviewed-procedure");
  });
  await record("address cannot certify a forged city selection","/api/chat",{message:"I need a building permit",state:"CA",locationAddress:publicAddress,placeIds:[sf.id]},data=>{
    assert.equal(data.status,"clarify");assert.equal(data.journey,undefined);
  });
  await record("birth records follow birth location, not residence","/api/chat",{message:"I live in California but was born in New York and need a birth certificate"},data=>{
    assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-birth-certificate-start");assert.equal(data.journey.coverageLevel,"official-handoff");assert.ok(data.journey.steps[0].detail.includes("current residence"));
  });
  await record("North Dakota voter exception","/api/chat",{message:"register to vote",state:"ND"},data=>{assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-nd-voting-start");assert.ok(data.journey.steps[0].detail.includes("does not require"));});
  await record("IRS free application and formation prerequisite","/api/chat",{message:"I need an EIN for my new LLC",state:"CA"},data=>{assert.equal(data.status,"matched");assert.equal(data.journey.id,"journey-irs-ein");assert.ok(data.journey.steps[1].detail.includes("entity formation"));assert.ok(data.journey.steps[2].fees.includes("$0 through the IRS."));});
  await record("license renewal does not become an out-of-state transfer","/api/chat",{message:"renew my driver license",state:"TX"},data=>{assert.notEqual(data.journey?.id,"journey-tx-license-transfer");assert.ok(["matched","discovered"].includes(data.status));});
  const unofficial=db.prepare("SELECT n.name,n.place_id,p.state_code FROM place_names n JOIN places p ON p.id=n.place_id WHERE n.status='unofficial' AND length(n.name)>3 AND length(n.name)<80 AND (SELECT count(*) FROM place_names other WHERE other.search_name=n.search_name)=1 LIMIT 1").get() as {name:string;place_id:string;state_code:string};
  await record("unofficial name labeling","/api/places?"+new URLSearchParams({q:unofficial.name,...(unofficial.state_code?{state:unofficial.state_code}:{})}),undefined,data=>{
    assert.ok(data.places.some((place:{id:string;matched_name_status:string})=>place.id===unofficial.place_id && place.matched_name_status==="unofficial"));
  });
  for (const page of ["/","/data","/guides/apply-for-or-renew-a-passport","/moving"]) {
    const response=await fetch(base+page);assert.equal(response.status,200,"Website page "+page);
    if(page==="/")assert.ok((await response.text()).includes("Illustrative scenarios, not testimonials"),"Homepage scenarios must render");
  }
  for (const [slug,marker] of [
    ["transfer-an-out-of-state-license-to-texas","Transfer an out-of-state"],
    ["surrender-new-york-plates-before-changing-insurance","Surrender New York vehicle plates"],
    ["report-damaged-public-property-in-san-francisco","Report damaged public property in San Francisco"],
  ]) {
    const response=await fetch(base+"/guides/"+slug);
    assert.equal(response.status,200,"Published guide page "+slug);
    assert.ok((await response.text()).includes(marker),"Published content missing on "+slug);
  }
  const summary={passed:results.length,statesCovered:states.map(state=>state.state_code),maximumMilliseconds:Math.max(...results.map(row=>row.milliseconds)),results};
  writeFileSync("data/govroute-scenario-results.json",JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify(summary));
} catch(error) { console.error(logs);throw error; }
finally {db.close();server.kill("SIGTERM");}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
