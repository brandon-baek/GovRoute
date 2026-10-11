import { createHash } from "node:crypto";
import { mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe,expect,it } from "vitest";
import { extractSnapshot,validateSnapshot } from "./registry-snapshot";

describe("bounded serving extraction",()=>{
  it("extracts and validates a snapshot without trusting existing file size",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"govroute-test-"));
    try {
      const content=Buffer.from("checked national snapshot"),compressed=gzipSync(content);
      const input=path.join(directory,"input.gz"),output=path.join(directory,"output.db");
      const manifest={schemaVersion:1,sha256:createHash("sha256").update(content).digest("hex"),bytes:content.length,compressedBytes:compressed.length};
      await writeFile(input,compressed);await writeFile(output,Buffer.alloc(content.length));
      expect(await extractSnapshot(input,output,manifest)).toBe(output);
      expect(await readFile(output)).toEqual(content);
      expect(await extractSnapshot(input,output,manifest)).toBe(output);
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it("rejects corrupted content and decompression beyond the declared size",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"govroute-test-"));
    try {
      const input=path.join(directory,"input.gz"),output=path.join(directory,"output.db");
      const compressed=gzipSync(Buffer.alloc(10000));await writeFile(input,compressed);
      await expect(extractSnapshot(input,output,{schemaVersion:1,sha256:"0".repeat(64),bytes:100,compressedBytes:compressed.length})).rejects.toThrow("exceeds");
      await expect(readFile(output)).rejects.toThrow();
      await expect(extractSnapshot(input,output,{schemaVersion:1,sha256:"0".repeat(64),bytes:10000,compressedBytes:compressed.length})).rejects.toThrow("integrity");
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it("rejects unbounded or incompatible manifests",()=>{
    for(const manifest of [
      {schemaVersion:2,sha256:"0".repeat(64),bytes:100,compressedBytes:20},
      {schemaVersion:1,sha256:"bad",bytes:100,compressedBytes:20},
      {schemaVersion:1,sha256:"0".repeat(64),bytes:400*1024*1024,compressedBytes:20}
    ]) expect(()=>validateSnapshot(manifest)).toThrow();
  });
});
