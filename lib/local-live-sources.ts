import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { localResources, type LocalResource } from "@/lib/local-resources";
import type { PlaceContext } from "@/lib/place-registry";
import { localTopics, extractLocalPassages, topicForPage, type LocalEvidence } from "@/lib/local-evidence";
const agent="Govroute/1.0 (official local task lookup)";
export function allowedOfficialUrl(value:string,domain:string) {
  const url=new URL(value);
  if(!/^[a-z0-9.-]+\.gov$/i.test(domain)||url.protocol!=="https:"||url.username||url.password||url.port||![domain,"www."+domain].includes(url.hostname))throw new Error("Unregistered government URL");
  if(/\.(?:pdf|zip|png|jpe?g|mp4|docx?|xlsx?)$/i.test(url.pathname))throw new Error("Dedicated document adapter required");
  url.hash="";return url;
}
function publicAddress(address:string) {
  if(address.includes(":"))return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
  const p=address.split(".").map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&p[0]>0&&p[0]<224&&![10,127].includes(p[0])&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&(p[1]===168||p[1]===0))&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19,51].includes(p[1]))&&!(p[0]===203&&p[1]===0);
}
async function download(value:string,domain:string,robots=false) {
  let url=allowedOfficialUrl(value,domain);
  for(let redirects=0;redirects<3;redirects++) {
    const ips=await lookup(url.hostname,{all:true});if(!ips.length||ips.some(ip=>!publicAddress(ip.address)))throw new Error("Private host blocked");
    const response=await fetch(url,{headers:{"User-Agent":agent,Accept:robots?"text/plain":"text/html"},redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(5000)});
    if([301,302,303,307,308].includes(response.status)) {const location=response.headers.get("location");if(!location)throw new Error();url=allowedOfficialUrl(new URL(location,url).href,domain);continue;}
    if(robots&&[404,410].includes(response.status))return {text:"",url:url.href};
    if(!response.ok||!response.body||(!robots&&!response.headers.get("content-type")?.includes("text/html")))throw new Error("Official page unavailable");
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>(robots?128*1024:1024*1024)){await reader.cancel();throw new Error("Page budget exceeded");}chunks.push(part.value);}
    return {text:Buffer.concat(chunks).toString("utf8"),url:url.href};
  }
  throw new Error("Redirect budget exceeded");
}
export function parseOfficialPage(html:string,url:string,domain:string,task:string) {
  const $=cheerio.load(html);const topic=localTopics.find(t=>t.id===task||t.terms.some(term=>task.toLowerCase().includes(term)));
  const terms=topic?[...topic.terms,...(topic.id==="building_permit"?["permit","building","planning"]:topic.id==="property"?["assessor","recorder","planning"]:[])]:localTopics.flatMap(t=>t.terms);
  const links=new Map<string,number>();
  $("a[href]").each((_,element)=>{try {const href=allowedOfficialUrl(new URL($(element).attr("href")!,url).href,domain).href;
    const text=($(element).text()+" "+href).toLowerCase();const score=terms.filter(term=>text.includes(term.replaceAll(" ","-"))||text.includes(term)).length;
    if(score>0)links.set(href,Math.max(links.get(href)??0,score));}catch{/* External or unsupported link. */}});
  const title=$("h1").first().text().trim()||$("title").text().trim();
  $("script,style,nav,header,footer,noscript,aside,form").remove();
  const root=$("main").length?$("main").first():$("body");
  const lines:string[]=[];root.find("p,li,h1,h2,h3,h4").each((_,e)=>{if($(e).children("p,li").length)return;const line=$(e).text().replace(/\s+/g," ").trim();if(line)lines.push(line);});
  return {title:title.slice(0,240),text:lines.join("\n").slice(0,120000),links:[...links].sort((a,b)=>b[1]-a[1]).map(([href])=>href).slice(0,2)};
}
const cache=new Map<string,{expires:number;promise:Promise<LocalEvidence[]>}>();
async function inspectGovernment(resource:Pick<LocalResource,"url"|"publisher"|"placeName">,task:string):Promise<LocalEvidence[]> {
  const domain=new URL(resource.url).hostname.replace(/^www\./,"");
  const key=resource.url+":"+task;const stored=cache.get(key);if(stored&&stored.expires>Date.now())return stored.promise;
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  const promise=(async()=>{
    const robotPage=await download("https://"+domain+"/robots.txt",domain,true);const rules=robotsParser(robotPage.url,robotPage.text);
    const delay=rules.getCrawlDelay(agent)??0;if(delay>2)return [];
    const root=allowedOfficialUrl(resource.url,domain).href;if(rules.isAllowed(root,agent)===false)return [];
    const home=await download(root,domain);const parsed=parseOfficialPage(home.text,home.url,domain,task);
    const pages=[{url:home.url,...parsed}];
    for(const href of parsed.links.filter(href=>href!==home.url).slice(0,2)) {
      if(rules.isAllowed(href,agent)===false)continue;
      await new Promise(resolve=>setTimeout(resolve,Math.max(1000,delay*1000)));
      try {const page=await download(href,domain);pages.push({url:page.url,...parseOfficialPage(page.text,page.url,domain,task)});}catch{/* Keep useful pages after a failed fetch. */}
    }
    return pages.flatMap(page=>{const topics=topicForPage(page.title,page.url);const requested=localTopics.find(t=>t.id===task||t.terms.some(term=>task.toLowerCase().includes(term)));const topic=requested?topics.find(t=>t.id===requested.id):topics[0];if(!topic)return [];
      const excerpts=extractLocalPassages(page.text,topic.terms).filter(line=>line.toLowerCase().trim()!==page.title.toLowerCase().trim());if(!excerpts.length)return [];
      return [{id:"live:"+createHash("sha256").update(page.url).digest("hex").slice(0,16),title:page.title,url:page.url,publisher:resource.publisher,placeName:resource.placeName,topic:topic.id,indexedAt:new Date().toISOString(),status:"machine-indexed" as const,contentHash:createHash("sha256").update(page.text).digest("hex"),excerpts,warning:"Retrieved now from the government website linked to your address area. These are source passages; topic authority and service eligibility still need confirmation."}];
    });
  })().catch(()=>[]);
  cache.set(key,{expires:Date.now()+60*60*1000,promise});return promise;
}
export async function liveAddressSources(context:PlaceContext|undefined,task:string,seeds:Pick<LocalResource,"url"|"publisher"|"placeName">[]=[]) {
  if(!task||!context?.places.length)return [];
  const normalizedTask=localTopics.find(t=>t.id===task||t.terms.some(term=>task.toLowerCase().includes(term)))?.id??"all";
  const resources=[...seeds,...(await localResources(context,task)).filter(r=>r.kind==="official_directory")].filter((r,i,a)=>a.findIndex(other=>other.url===r.url)===i).slice(0,2);
  return (await Promise.all(resources.map(resource=>inspectGovernment(resource,normalizedTask)))).flat().slice(0,6);
}
