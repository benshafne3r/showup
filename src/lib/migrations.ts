/**
 * Which migration files a database hasn't recorded. Records come from two
 * writers with different shapes:
 *   - Supabase CLI (local):   version "0007", name "connect_payouts"
 *   - Supabase MCP / backfill: version "20261006192057" or "0007", name "0007_connect_payouts"
 */
export function missingMigrations(
  files: string[],
  applied: Array<{ version: string; name: string }>,
): string[] {
  return files
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.replace(/\.sql$/, ""))
    .filter((base) => {
      const [prefix, ...rest] = base.split("_");
      const suffix = rest.join("_");
      return !applied.some(
        (row) => row.name === base || (row.version === prefix && (row.name === suffix || row.name === "")),
      );
    })
    .sort();
}
