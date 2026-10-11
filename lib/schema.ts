import { z } from "zod";

export const jurisdictionSchema = z.enum(["federal", "california", "federal-and-state", "state", "local"]);
export const reviewStatusSchema = z.enum(["verified", "review-due", "machine-indexed"]);

export const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  lastChecked: z.string(),
  retrievedAt: z.string().optional(),
  contentHash: z.string().optional()
});

export const journeyStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  sourceIds: z.array(z.string()).min(1),
  requirements: z.array(z.string()).optional(),
  fees: z.array(z.string()).optional(),
  deadlines: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  action: z.object({ label: z.string(), url: z.string().url() }).optional(),
  caution: z.string().optional()
});

export const journeySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  jurisdiction: jurisdictionSchema,
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  locality: z.string().max(120).optional(),
  territoryIds: z.array(z.string().min(1).max(150)).max(60).optional(),
  audience: z.array(z.string()),
  aliases: z.array(z.string()),
  reviewStatus: reviewStatusSchema,
  reviewedAt: z.string(),
  estimatedTime: z.string().optional(),
  eligibility: z.array(z.string()).optional(),
  officialAction: z.object({ label: z.string(), url: z.string().url() }).optional(),
  steps: z.array(journeyStepSchema).min(1),
  sources: z.array(sourceSchema).min(1)
});

export type Journey = z.infer<typeof journeySchema>;
export type JourneyStep = z.infer<typeof journeyStepSchema>;
export type Source = z.infer<typeof sourceSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["journey", "step", "agency", "source", "program", "requirement"]),
  label: z.string(),
  description: z.string(),
  params: z.object({
    jurisdiction: jurisdictionSchema.optional(),
    audience: z.array(z.string()).default([]),
    category: z.string().optional(),
    status: reviewStatusSchema,
    reviewedAt: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    contentHash: z.string().optional(),
    retrievedAt: z.string().optional(),
    httpStatus: z.number().int().optional(),
    etag: z.string().optional(),
    lastModified: z.string().optional(),
    sourceIds: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    catalogSource: z.string().optional(),
    connector: z.string().optional(),
    state: z.string().optional()
  })
});

export const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.enum(["contains", "next", "published-by", "supported-by", "related-to"]),
  order: z.number().optional()
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const chatRequestSchema = z.object({
  placeIds: z.array(z.string().min(1).max(150)).max(60).optional(),
  message: z.string().trim().min(3).max(600),
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  locality: z.string().trim().max(80).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1200) }))
    .max(8)
    .default([])
});

export type RetrievalMatch = {
  journey: Journey;
  score: number;
  matchedTerms: string[];
};
