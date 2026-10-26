import Database from "better-sqlite3";
import {afterEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({db:null as unknown}));
vi.mock("@/lib/place-registry",()=>({openRegistry:async()=>state.db}));
vi.mock("@/lib/process-registry",()=>({publishedProcesses:async()=>({journeys:[]})}));
import {addressLocalActions} from "./local-evidence";
import type {PlaceContext} from "./place-registry";
afterEach(()=>{(state.db as Database.Database|null)?.close();state.db=null;});
describe("address-specific local evidence isolation",()=>{
 it("extracts only the selected government's task pages and preserves failed-refresh warnings",async()=>{
  const db=new Database(":memory:");state.db=db;
  db.exec(`CREATE TABLE places(id TEXT, name TEXT);CREATE TABLE government_domains(domain TEXT,organization TEXT,match_status TEXT);CREATE TABLE domain_places(domain TEXT,place_id TEXT);CREATE TABLE directory_pages(id INTEGER,title TEXT,url TEXT,content TEXT,sha256 TEXT,retrieved_at TEXT,domain TEXT);CREATE TABLE directory_checks(id INTEGER,url TEXT,status TEXT);`);
  for(const name of ["selected","other"]){db.prepare("INSERT INTO places VALUES(?,?)").run(name,name+" city");db.prepare("INSERT INTO government_domains VALUES(?,?,?)").run(name+".gov",name+" government","linked");db.prepare("INSERT INTO domain_places VALUES(?,?)").run(name+".gov",name);db.prepare("INSERT INTO directory_pages VALUES(?,?,?,?,?,?,?)").run(name==="selected"?1:2,"Building permits","https://"+name+".gov/building-permits","Submit the signed building permit application and site plans to "+name+" city.","sha",new Date().toISOString(),name+".gov");}
  db.prepare("INSERT INTO directory_checks VALUES(?,?,?)").run(1,"https://selected.gov/building-permits","unavailable");
  const context={places:[{id:"selected",kind:"municipality",government_status:"active",state_code:"CA"}],relations:[],authorities:[],unresolved:[],precision:"address_range"} as PlaceContext;
  const result=await addressLocalActions(context,"building_permit");
  expect(result.evidence).toHaveLength(1);expect(result.evidence[0].url).toBe("https://selected.gov/building-permits");expect(result.evidence[0].warning).toContain("refresh failed");expect(result.evidence[0].excerpts[0]).toContain("selected city");expect(JSON.stringify(result)).not.toContain("other city");
 });
});
