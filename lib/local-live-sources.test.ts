import {describe,it,expect,vi} from "vitest";
vi.mock("@/lib/local-resources",()=>({localResources:async()=>[]}));
vi.mock("@/lib/place-registry",()=>({openRegistry:async()=>null}));
vi.mock("@/lib/process-registry",()=>({publishedProcesses:async()=>({journeys:[]})}));
import {allowedOfficialUrl,parseOfficialPage} from "./local-live-sources";
describe("bounded official local source discovery",()=>{
 it("refuses external domains, credential URLs, non-government domains and document formats",()=>{
  for(const url of ["https://evil.test/","http://example.gov/","https://user:pass@example.gov/","https://example.gov:8443/","https://example.gov/file.pdf"])expect(()=>allowedOfficialUrl(url,"example.gov")).toThrow();
  expect(allowedOfficialUrl("https://www.example.gov/permits#start","example.gov").href).toBe("https://www.example.gov/permits");
 });
 it("finds task links without following irrelevant or outside links",()=>{
  const page=parseOfficialPage('<html><body><nav>Submit your cookie settings</nav><main><h1>Building permits</h1><p>Submit the signed permit application and site plan at the public counter.</p><a href="/building-permit/apply">Apply for a building permit</a><a href="https://evil.test/building-permit">Other</a></main></body></html>',"https://example.gov/","example.gov","building_permit");
  expect(page.text).toContain("Submit the signed permit");expect(page.text).not.toContain("cookie");expect(page.links).toEqual(["https://example.gov/building-permit/apply"]);
 });
});
