import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export type SnapshotManifest={sha256:string;bytes:number;compressedBytes:number;schemaVersion:number};
export function validateSnapshot(manifest:SnapshotManifest) {
  if (manifest.schemaVersion!==1 || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || !(manifest.bytes>0 && manifest.bytes<=350*1024*1024)
      || !(manifest.compressedBytes>0 && manifest.compressedBytes<=80*1024*1024)) throw new Error("Invalid serving snapshot manifest");
}
export async function extractSnapshot(compressed:string,destination:string,manifest:SnapshotManifest) {
  validateSnapshot(manifest);
  const existing=await stat(destination).catch(()=>null);
  if (existing?.size===manifest.bytes) {
    const hash=createHash("sha256");
    await pipeline(createReadStream(destination),new Writable({write(chunk,_,done){hash.update(chunk);done();}}));
    if (hash.digest("hex")===manifest.sha256) return destination;
  }
  if ((await stat(compressed)).size!==manifest.compressedBytes) throw new Error("Compressed serving size mismatch");
  const temp=destination+".extract-"+process.pid;
  const hash=createHash("sha256"); let bytes=0;
  await rm(temp,{force:true});
  try {
    await pipeline(createReadStream(compressed),createGunzip(),
      new Transform({transform(chunk,_,done){bytes+=chunk.length;hash.update(chunk);done(bytes>manifest.bytes ? new Error("Serving snapshot exceeds manifest") : null,chunk);}}),
      createWriteStream(temp,{flags:"wx"}));
    if(bytes!==manifest.bytes || hash.digest("hex")!==manifest.sha256) throw new Error("Serving snapshot integrity mismatch");
    await rename(temp,destination);
    return destination;
  } finally { await rm(temp,{force:true}); }
}
