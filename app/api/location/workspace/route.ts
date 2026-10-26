import { NextRequest, NextResponse } from "next/server";
import { contextForAddress } from "@/lib/place-registry";
import { addressLocalActions } from "@/lib/local-evidence";
import { resolveAddress } from "@/lib/address-resolver";
import { buildAddressWorkspace } from "@/lib/address-workspace";
import { consumeRequest } from "@/lib/request-limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!consumeRequest(key)) return NextResponse.json({ message: "Please wait before another address lookup." }, { status: 429, headers });
  let address: string; let task=""; let parcelId:string|undefined;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return NextResponse.json({ message: "Address request too large." }, { status: 413, headers }); }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["address","task","parcelId"].includes(k)) || typeof body.address !== "string" || body.address.trim().length < 8 || body.address.length > 240) throw new Error();
    if(body.task!==undefined && (typeof body.task!=="string" || body.task.length>160))throw new Error();
    if(body.parcelId!==undefined && (typeof body.parcelId!=="string" || !/^[0-9]{10}$/.test(body.parcelId)))throw new Error();
    address = body.address.trim(); task=body.task??""; parcelId=body.parcelId;
  } catch { return NextResponse.json({ message: "Provide the complete address selected in the location lookup." }, { status: 400, headers }); }
  try {
    const matches = await resolveAddress(address);
    if (matches.length !== 1) return NextResponse.json({ message: "Choose one address match in the location lookup, then try again." }, { status: 409, headers });
    // Re-resolve server-side; never trust visitor-supplied coordinates or county IDs.
    const report=await buildAddressWorkspace(matches[0],fetch,parcelId);
    try {report.localActions=await addressLocalActions(await contextForAddress(matches[0]),task);} catch {report.localActions={procedures:[],evidence:[],topics:[],unavailable:true};}
    return NextResponse.json(report, { headers });
  } catch { return NextResponse.json({ message: "The official address service is unavailable. Community guides remain available; retry the address report later." }, { status: 503, headers }); }
}

