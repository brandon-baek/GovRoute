// Best-effort abuse control per process. A hosting firewall must enforce limits
// across serverless instances. Paid AI remains off by default regardless.
const windows = new Map<string, { count: number; resetsAt: number }>();
export function consumeRequest(key: string, now = Date.now()) {
  for (const [address, value] of windows) if (value.resetsAt <= now) windows.delete(address);
  if (!windows.has(key) && windows.size >= 5000) return false;
  const current = windows.get(key) ?? { count: 0, resetsAt: now + 60_000 };
  current.count += 1;
  windows.set(key, current);
  return current.count <= 30;
}

let aiWindow = { count: 0, resetsAt: 0 };
export function consumeAIRoute(now = Date.now()) {
  if ((process.env.GOVROUTE_ENABLE_PAID_AI ?? process.env.GOVGUIDE_ENABLE_PAID_AI) !== "true") return false;
  if (aiWindow.resetsAt <= now) aiWindow = { count: 0, resetsAt: now + 3_600_000 };
  const configured = Number(process.env.GOVROUTE_AI_ROUTES_PER_HOUR ?? process.env.GOVGUIDE_AI_ROUTES_PER_HOUR ?? 20);
  const limit = Number.isFinite(configured) ? Math.max(0, Math.min(100, configured)) : 0;
  if (aiWindow.count >= limit) return false;
  aiWindow.count += 1;
  return true;
}
