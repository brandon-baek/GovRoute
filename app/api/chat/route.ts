import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { chatRequestSchema } from "@/lib/schema";
import { classifyRetrieval, retrieveJourneys } from "@/lib/retrieval";
import { findSensitiveData, isLikelyEmergency } from "@/lib/safety";
import { routeWithAI } from "@/lib/ai-router";
import { traceJourney } from "@/lib/graph";
import { getStoredJourneys } from "@/lib/database";
import { retrieveDiscoveredGuides } from "@/lib/discovered-guides";
import { consumeRequest, consumeAIRoute } from "@/lib/request-limits";
import { stateByCode, statesInText } from "@/lib/jurisdictions";
import { contextForPlaces, relevantLegalSources } from "@/lib/place-registry";
import { parcelRequirements, requiresParcelEvidence } from "@/lib/place-context";
import { processJourneys } from "@/lib/process-catalog";
import { publishedProcesses } from "@/lib/process-registry";
import { publicationPlaceIds } from "@/lib/scope-context";
import { localResources } from "@/lib/local-resources";

export const runtime = "nodejs";

function rateLimited(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return !consumeRequest(key);
}

export async function POST(request: NextRequest) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { status: "error", message: "Too many requests. Please wait a minute and try again.", alternatives: [] },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ status: "error", message: "A request is required.", alternatives: [] }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return NextResponse.json({ status: "error", message: "Request too large.", alternatives: [] }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = chatRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (body.state && !stateByCode(body.state)) return NextResponse.json({ status: "error", message: "Choose a supported state or territory.", alternatives: [] }, { status: 400 });
    const sensitive = findSensitiveData(body.message);
    if (sensitive.length > 0) {
      return NextResponse.json({
        status: "blocked",
        message: `Please remove the ${sensitive.join(" and ")} before continuing. govroute does not need sensitive identification or account numbers.`,
        alternatives: []
      });
    }

    if (isLikelyEmergency(body.message)) {
      return NextResponse.json({
        status: "blocked",
        message: "If someone is in immediate danger, call 911 or your local emergency number now. govroute is not an emergency service.",
        alternatives: []
      });
    }

    const context = body.placeIds?.length ? await contextForPlaces(body.placeIds) : undefined;
    if (body.placeIds?.length && body.placeIds.some(id => !context?.places.some(place => place.id === id))) return NextResponse.json({ status: "clarify", message: "Your selected place is unavailable. Search for the location again or choose a state.", alternatives: [] });
    const contextStates = [...new Set(context?.places.map((place) => place.state_code).filter((code): code is string => Boolean(code)) ?? [])];
    if (contextStates.length > 1 || (body.state && contextStates.length === 1 && body.state !== contextStates[0])) return NextResponse.json({ status: "clarify", message: "Your location crosses state boundaries or differs from the selected state. Choose the state whose process you need.", alternatives: [] });
    const locations = statesInText(body.message);
    const federalPassport = /\bpassport\b/i.test(body.message);
    const location = body.state ?? contextStates[0] ?? locations[0]?.code;
    // Moving is a specific multi-state pathway, not the default route for any
    // request mentioning a move (e.g. passport renewal after moving).
    if (/\b(mov(?:e|ed|ing)|relocat(?:e|ing)|another state|out.of.state)\b/i.test(body.message)
      && !federalPassport
      && (locations.length > 1 || /\bmoving checklist\b/i.test(body.message)
        || (!location && /\b(driver|driving|license|vehicle|registration|car)\b/i.test(body.message)))) {
      return NextResponse.json({ status: "clarify", message: "Moving between states? Choose your origin and destination in the moving planner to combine both jurisdictions into one checklist.", alternatives: [{ id: "moving", slug: "", title: "Build my moving checklist", href: "/moving" }] });
    }
    if (!federalPassport && !body.state && locations.length > 1) return NextResponse.json({ status: "clarify", message: "Which state's rules should I use? Choose a state above or use the moving planner for a cross-state process.", alternatives: [] });
    if (!federalPassport && body.state && locations.length === 1 && body.state !== locations[0].code) return NextResponse.json({ status: "clarify", message: "Your request names a different state from the selected location. Choose the state whose rules you need, then try again.", alternatives: [] });
    if (requiresParcelEvidence(body.message)) {
      const sources = await relevantLegalSources(context?.places.map((place) => place.id) ?? [], "property");
      const directoryResources = await localResources(context, body.message);
      return NextResponse.json({ status: "coverage_gap", message: "To find what you can do on a particular property, start with its parcel, zoning, and recorded restrictions. A community name or address-range match does not establish your land rights.",
        alternatives: [], steps: parcelRequirements, sources, directoryResources, title: "Find the rules for your property",
        missing: ["Parcel and boundary verification", "Current zoning and overlays", "Recorded deeds, easements, and covenants"],
        scopeNote: sources.length ? "These are potentially relevant official sources. A property-specific pathway still requires the listed records." : "Property-specific sources have not been connected for this location yet." });
    }
    const stored = getStoredJourneys();
    const scopedIds=publicationPlaceIds(context,body.placeIds??[]);
    const processes = await publishedProcesses(location, scopedIds);
    const processIds = new Set([...processJourneys, ...processes.journeys].map((journey) => journey.id));
    const records = [...stored.journeys.filter((journey) => !processIds.has(journey.id)), ...processes.journeys];
    let matches = retrieveJourneys(body.message, 8, records, location, scopedIds);
    // Legacy local guides use names rather than stable jurisdiction IDs. Until
    // migrated, they must not be certified by a free-text postal/community name.
    const confirmedLocality = context?.places.find((place) => place.kind === "municipality" && place.government_status === "active")?.name;
    const discoveredMatches = retrieveDiscoveredGuides(body.message, 6, location, confirmedLocality);
    let router: "graph" | "graph+ai" = "graph";
    if (classifyRetrieval(matches) === "clarify" && consumeAIRoute()) {
      try {
        const aiRoute = await routeWithAI(body.message, matches.map((match) => match.journey.id));
        const selected = aiRoute?.journeyId ? records.find((journey) => journey.id === aiRoute.journeyId) : undefined;
        if (selected) {
          matches = [
            { journey: selected, score: Math.max(matches.find((match) => match.journey.id === selected.id)?.score ?? 0, 30), matchedTerms: ["semantic match"] },
            ...matches.filter((match) => match.journey.id !== selected.id)
          ];
          router = "graph+ai";
        }
      } catch {
        // The deterministic graph router remains available if the optional model fails.
      }
    }

    const classification = classifyRetrieval(matches);
    const bestDiscovered = discoveredMatches[0];
    const useDiscovered = Boolean(bestDiscovered && (classification !== "matched" || bestDiscovered.score > (matches[0]?.score ?? 0)));
    // Only the selected route can require location. A weaker state discovery
    // must not interrupt a well-matched federal passport pathway.
    const selectedJurisdiction = useDiscovered ? bestDiscovered.guide.jurisdiction : matches[0]?.journey.jurisdiction;
    const hasLocalPublicationScope = !useDiscovered && selectedJurisdiction === "local" && Boolean(matches[0]?.journey.territoryIds?.some(id => scopedIds.includes(id)));
    if (!location && !hasLocalPublicationScope && selectedJurisdiction && selectedJurisdiction !== "federal") {
      return NextResponse.json({ status: "clarify", message: "Choose your state above so I can find the right jurisdiction. For a city or county service, also enter its jurisdiction name.", alternatives: [] });
    }
    if (bestDiscovered && useDiscovered) {
      return NextResponse.json({
        status: "discovered",
        message: bestDiscovered.guide.summary,
        guide: bestDiscovered.guide,
        alternatives: discoveredMatches.slice(1, 4).map(({ guide }) => ({ id: guide.id, slug: guide.slug, title: guide.title, summary: guide.summary })),
        provenance: { router: "discovered-guide-index", assembledFrom: [bestDiscovered.guide.sourceId] }
      });
    }
    if ((classification !== "matched" || matches[0]?.journey.jurisdiction !== "local" || !processIds.has(matches[0].journey.id)) && /\b(building permit|construction permit|trash collection|garbage collection|sewer service|water service|local ordinance)\b/i.test(body.message)) {
      if (!location && !context?.places.length) return NextResponse.json({status:"clarify",message:"Choose a community or address area so I can find official local starting points.",alternatives:[]});
      const directoryResources=await localResources(context,body.message);
      return NextResponse.json({status:"coverage_gap",title:"Find your local service",message:"This local procedure has not been verified for your selected area yet.",alternatives:[],
        steps:["Confirm the city, county, or service district responsible for the request.","Use the official starting points below to locate the department and current application.","Confirm requirements, costs, deadlines, and service boundaries with that department before applying."],
        sources:[],directoryResources,missing:["Reviewed local procedure","Confirmed topic authority and service area"],
        scopeNote:directoryResources.length ? "Official registrations and crawled pages identify starting points. They do not certify that a department handles this particular task." : "No local website has been linked confidently for this area yet. Try the full street address or contact the state government directory."});
    }
    if (classification === "unsupported") {
      const state=stateByCode(location);
      if (state) return NextResponse.json({status:"coverage_gap",title:"Find the official next step",message:"I do not have a verified step-by-step procedure for this task in "+state.name+" yet.",alternatives:[],
        steps:["Open the official state directory or agency website.","Find the department handling your request and check which local office serves your address.","Confirm the current application, documents, fees, and timing on that department's page."],
        sources:[{id:"state-directory:"+state.code,title:state.name+" government directory",url:state.directoryUrl,publisher:"USA.gov"}],
        directoryResources:await localResources(context,body.message),missing:["Reviewed procedure for this task and area"],
        scopeNote:"These are official starting points; they are not a verified local procedure."});

      return NextResponse.json({
        status: "unsupported",
        message: "I could not match that request to a published guide yet. Try describing the outcome, document, benefit, notice, or agency in different words.",
        alternatives: [],
        officialSearchUrl: `https://search.usa.gov/search?affiliate=usagov&query=${encodeURIComponent(body.message)}`
      });
    }

    if (classification === "clarify") {
      return NextResponse.json({
        status: "clarify",
        message: "I found a few possible routes. Which one is closest?",
        alternatives: matches.slice(0, 3).map(({ journey }) => ({ id: journey.id, slug: journey.slug, title: journey.title, summary: journey.summary }))
      });
    }

    const journey = matches[0].journey;
    return NextResponse.json({
      status: "matched",
      message: journey.summary,
      journey,
      alternatives: matches.slice(1, 3).map(({ journey: alternative }) => ({ id: alternative.id, slug: alternative.slug, title: alternative.title })),
      provenance: {
        router,
        storage: stored.storage,
        processStorage: processIds.has(journey.id) ? processes.storage : undefined,
        journeyNodeId: journey.id,
        matchedTerms: matches[0].matchedTerms,
        assembledFrom: journey.steps.flatMap((step) => step.sourceIds).filter((id, index, values) => values.indexOf(id) === index),
        graph: traceJourney(journey)
      }
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ status: "error", message: "Please enter a request between 3 and 600 characters.", alternatives: [] }, { status: 400 });
    }
    return NextResponse.json({ status: "error", message: "govroute could not process that request. Please try again.", alternatives: [] }, { status: 500 });
  }
}
