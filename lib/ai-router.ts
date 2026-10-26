import OpenAI from "openai";
import { z } from "zod";
import { journeys } from "@/data/curated/journeys";

const routeSchema = z.object({
  journeyId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(160)
});

export async function routeWithAI(message: string, candidateIds: string[]) {
  if ((process.env.GOVROUTE_ENABLE_PAID_AI ?? process.env.GOVGUIDE_ENABLE_PAID_AI) !== "true" || !process.env.OPENAI_API_KEY || candidateIds.length === 0) return null;

  const candidates = journeys
    .filter((journey) => candidateIds.includes(journey.id))
    .map((journey) => ({ id: journey.id, title: journey.title, aliases: journey.aliases, summary: journey.summary }));

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 4000, maxRetries: 0 });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    max_output_tokens: 200,
    input: [
      {
        role: "system",
        content: "Select only the best matching journey ID from the supplied candidates. You classify intent only. Do not answer the user, infer eligibility, or add government facts. Return null when none clearly match."
      },
      { role: "user", content: JSON.stringify({ request: message, candidates }) }
    ],
    text: { format: { type:"json_schema",name:"govroute_route",strict:true,schema:{type:"object",properties:{journeyId:{type:["string","null"]},confidence:{type:"number"},reason:{type:"string"}},required:["journeyId","confidence","reason"],additionalProperties:false} } }
  });

  const checked=routeSchema.safeParse(JSON.parse(response.output_text));
  const parsed=checked.success?checked.data:null;
  if (!parsed?.journeyId || !candidateIds.includes(parsed.journeyId) || parsed.confidence < 0.62) return null;
  return parsed;
}

