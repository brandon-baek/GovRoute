import { openRegistry, type PlaceContext } from "@/lib/place-registry";

export type LocalResource = {
  id: string; title: string; url: string; publisher: string; placeId: string;
  placeName: string; kind: "official_directory" | "indexed_page";
  verification: "registered_organization_exact"; reviewStatus: "directory_only" | "machine_indexed";
  retrievedAt: string;
  lastCheckStatus: "indexed" | "unchanged" | "unavailable" | "blocked" | "not_checked";
  lastCheckedAt: string | null;
};

export async function localResources(context?: PlaceContext, query = ""): Promise<LocalResource[]> {
  const db=await openRegistry();
  if (!db || !context?.places.length || !db.prepare("SELECT 1 FROM sqlite_master WHERE name='domain_places'").get()) return [];
  const ids=context.places.map(place=>place.id).slice(0,60);
  const domains=db.prepare(`SELECT d.domain,d.organization,d.retrieved_at,b.place_id,p.name AS place_name,
    coalesce((SELECT status FROM directory_checks c WHERE c.domain=d.domain AND c.url IN ('https://'||d.domain||'/','https://www.'||d.domain||'/') ORDER BY c.id DESC LIMIT 1),'not_checked') AS last_check_status,
    (SELECT checked_at FROM directory_checks c WHERE c.domain=d.domain AND c.url IN ('https://'||d.domain||'/','https://www.'||d.domain||'/') ORDER BY c.id DESC LIMIT 1) AS last_checked_at
    FROM domain_places b JOIN government_domains d ON d.domain=b.domain JOIN places p ON p.id=b.place_id
    WHERE b.place_id IN (${ids.map(()=>"?").join(",")}) AND d.match_status='linked'
    ORDER BY CASE p.kind WHEN 'municipality' THEN 0 WHEN 'county_subdivision' THEN 1 WHEN 'county' THEN 2 ELSE 3 END,d.domain LIMIT 12`)
    .all(...ids) as {domain:string;organization:string;retrieved_at:string;place_id:string;place_name:string;last_check_status:LocalResource["lastCheckStatus"];last_checked_at:string|null}[];
  const resources: LocalResource[]=[];
  const words=[...new Set(query.toLowerCase().match(/[a-z]{3,}/g)??[])].slice(0,12);
  for (const domain of domains) {
    const pages=db.prepare("SELECT p.url,p.title,p.retrieved_at,coalesce((SELECT status FROM directory_checks c WHERE c.url=p.url ORDER BY c.id DESC LIMIT 1),'not_checked') AS last_check_status,(SELECT checked_at FROM directory_checks c WHERE c.url=p.url ORDER BY c.id DESC LIMIT 1) AS last_checked_at FROM directory_pages p WHERE p.domain=? ORDER BY p.retrieved_at DESC LIMIT 40").all(domain.domain) as {url:string;title:string;retrieved_at:string;last_check_status:LocalResource["lastCheckStatus"];last_checked_at:string|null}[];
    const ranked=pages.map(page=>({page,score:words.filter(word=>(page.title+" "+page.url).toLowerCase().includes(word)).length})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score).slice(0,2);
    resources.push({id:"directory:"+domain.domain,title:domain.organization,url:"https://"+domain.domain+"/",publisher:domain.organization,placeId:domain.place_id,placeName:domain.place_name,
      kind:"official_directory",verification:"registered_organization_exact",reviewStatus:"directory_only",retrievedAt:domain.retrieved_at,lastCheckStatus:domain.last_check_status,lastCheckedAt:domain.last_checked_at});
    for (const {page} of ranked) resources.push({id:"page:"+page.url,title:page.title,url:page.url,publisher:domain.organization,placeId:domain.place_id,placeName:domain.place_name,
      kind:"indexed_page",verification:"registered_organization_exact",reviewStatus:"machine_indexed",retrievedAt:page.retrieved_at,lastCheckStatus:page.last_check_status,lastCheckedAt:page.last_checked_at});
  }
  return resources;
}
