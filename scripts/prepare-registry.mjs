import { createHash } from "node:crypto";
import { createReadStream,createWriteStream } from "node:fs";
import { readFile,rename,rm,stat } from "node:fs/promises";
import { Readable,Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const manifest=JSON.parse(await readFile("data/registry/runtime-release.json","utf8").catch(()=>"{\"status\":\"pending\"}"));
const target="data/govroute-runtime.db",compressedTarget=target+".gz";
if(process.env.GOVROUTE_PREPARE_REGISTRY_SKIP==="true") {
  console.log("Using the fresh CI serving projection.");
} else if(!manifest.url) {
  console.log("No pinned national serving release yet; bundled procedures remain available.");
} else {
  if(!/^https:\/\/github\.com\/brandon-baek\/Project-Gov\/releases\/download\/registry-[a-f0-9]{40}(?:-[0-9]+)?\/govroute-runtime\.db\.gz$/.test(manifest.url)
      || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.schemaVersion!==1
      || !(manifest.bytes>0 && manifest.bytes<=350*1024*1024)
      || !(manifest.compressedBytes>0 && manifest.compressedBytes<=80*1024*1024)) throw new Error("Invalid pinned national registry manifest");
  const compressedTemp=compressedTarget+".download",temp=target+".download";
  let compressed=0,bytes=0;const hash=createHash("sha256");
  try {
    const response=await fetch(manifest.url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok || !response.body) throw new Error("Pinned registry download failed");
    await pipeline(Readable.fromWeb(response.body),
      new Transform({transform(chunk,_,done){compressed+=chunk.length;done(compressed>manifest.compressedBytes?new Error("Compressed registry exceeds manifest"):null,chunk);}}),
      createWriteStream(compressedTemp,{flags:"wx"}));
    if(compressed!==manifest.compressedBytes) throw new Error("Compressed serving size mismatch");
    await pipeline(createReadStream(compressedTemp),createGunzip(),
      new Transform({transform(chunk,_,done){bytes+=chunk.length;hash.update(chunk);done(bytes>manifest.bytes?new Error("Serving registry exceeds manifest"):null,chunk);}}),
      createWriteStream(temp,{flags:"wx"}));
    if(bytes!==manifest.bytes || hash.digest("hex")!==manifest.sha256) throw new Error("National registry integrity mismatch");
    await rename(temp,target);await rename(compressedTemp,compressedTarget);
    console.log("National serving registry verified: "+(await stat(target)).size+" bytes; "+manifest.placeCount+" places.");
  } finally {await rm(temp,{force:true});await rm(compressedTemp,{force:true});}
}
