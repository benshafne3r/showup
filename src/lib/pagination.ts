/**
 * Page-number pagination for list pages: `?page=2`. Pages read one page of
 * rows with the true total (`count: "exact"` or a SQL `count(*) over ()`), so
 * nothing silently stops at a fixed cap.
 */
export function pageOf(raw: string | string[] | undefined, size: number) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(n) && n > 1 ? Math.min(n, 10_000) : 1;
  const from = (page - 1) * size;
  return { page, size, from, to: from + size - 1 };
}

/** Same query string with a different page (page 1 drops the param). */
export function withPage(params: Record<string, string | string[] | undefined>, page: number, key = "page") {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === key || v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
  }
  if (page > 1) qs.set(key, String(page));
  const s = qs.toString();
  return s ? `?${s}` : "?";
}

/** "Load more" lists: `?limit=` rounded to whole steps, between one step and `max`. */
export function growingLimit(raw: string | string[] | undefined, step: number, max: number) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n <= step) return step;
  return Math.min(Math.ceil(n / step) * step, max);
}
