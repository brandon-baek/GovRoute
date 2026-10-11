import { journeys } from "@/data/curated/journeys";
import type { Journey, RetrievalMatch } from "@/lib/schema";
import { matchesLocation, statesInText } from "@/lib/jurisdictions";

const stopwords = new Set([
  "a", "about", "an", "and", "are", "can", "do", "for", "get", "how", "i", "in", "is", "it", "me", "my", "need", "of", "on", "or", "please", "the", "to", "want", "what", "with"
]);

const expansions: Record<string, string[]> = {
  fired: ["unemployment", "job", "laid", "off"],
  layoff: ["unemployment", "laid", "off"],
  laid: ["unemployment", "job"],
  missing: ["lost", "replace"],
  stolen: ["lost", "replace", "theft"],
  groceries: ["food", "calfresh", "snap"],
  medicaid: ["medi-cal", "health", "coverage"],
  college: ["fafsa", "student", "aid"],
  scammer: ["scam", "fraud"],
  moved: ["address", "mail", "moving"],
  dmv: ["driver", "license", "vehicle"],
  car: ["vehicle", "registration"],
  driving: ["driver", "license"],
  unemployed: ["unemployment", "job"],
  retirement: ["social", "security", "medicare"],
  company: ["business", "ein"],
  id: ["identity", "license", "card"],
  resident: ["green", "card"],
  veteran: ["va", "disability"]
};

export function tokenize(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopwords.has(token));
  const expanded = base.flatMap((token) => [token, ...(expansions[token] ?? [])]);
  return [...new Set(expanded)];
}

function occurrences(haystack: string, needle: string) {
  if (!needle || !haystack.includes(needle)) return 0;
  return haystack === needle ? 2 : 1;
}

function scoreJourney(query: string, journey: Journey): RetrievalMatch {
  const normalized = query.toLowerCase().replace(/[’']/g, "'");
  const terms = tokenize(query);
  const title = journey.title.toLowerCase();
  const summary = journey.summary.toLowerCase();
  const category = journey.category.toLowerCase();
  const aliases = journey.aliases.map((alias) => alias.toLowerCase());
  let score = 0;
  const matchedTerms = new Set<string>();

  for (const alias of aliases) {
    if (normalized.includes(alias)) {
      score += 18 + Math.min(alias.split(/\s+/).length * 2, 8);
      matchedTerms.add(alias);
    }
  }

  for (const term of terms) {
    let termScore = 0;
    termScore += occurrences(title, term) * 6;
    termScore += occurrences(category, term) * 3;
    termScore += occurrences(summary, term) * 2;
    termScore += Math.min(aliases.reduce((sum, alias) => sum + occurrences(alias, term), 0), 2) * 4;
    if (termScore > 0) {
      score += termScore;
      matchedTerms.add(term);
    }
  }

  const saysCalifornia = /\b(california|ca|calif)\b/i.test(query);
  if (saysCalifornia && journey.jurisdiction !== "federal") score += 7;
  if (saysCalifornia && journey.jurisdiction === "federal") score -= 2;

  return { journey, score, matchedTerms: [...matchedTerms] };
}

export function retrieveJourneys(query: string, limit = 4, records: Journey[] = journeys, state?: string, placeIds: string[] = []) {
  const location = state ?? statesInText(query)[0]?.code;
  return records
    .filter((journey) => matchesLocation(journey, location, undefined, placeIds))
    .map((journey) => scoreJourney(query, journey))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.journey.title.localeCompare(b.journey.title))
    .slice(0, limit);
}

export function getJourneyBySlug(slug: string) {
  return journeys.find((journey) => journey.slug === slug);
}

export function getJourneyById(id: string) {
  return journeys.find((journey) => journey.id === id);
}

export function classifyRetrieval(matches: RetrievalMatch[]) {
  const [first, second] = matches;
  if (!first || first.score < 10) return "unsupported" as const;
  if (second && first.score < 28 && first.score - second.score < 6) return "clarify" as const;
  return "matched" as const;
}
