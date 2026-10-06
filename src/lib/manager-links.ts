/**
 * Map a creator-portal link to the matching management-portal page, so a
 * manager copied on a creator's notification lands somewhere useful.
 */
export function managerLinkFor(link: string | undefined): string {
  if (!link) return "/manager";
  const path = link.split(/[?#]/)[0];
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/creator\/messages\/([^/]+)$/))) return `/manager/messages/${m[1]}`;
  if (/^\/creator\/(messages|requests)$/.test(path)) return "/manager/messages?tab=requests";
  if ((m = path.match(/^\/creator\/bookings\/([^/]+)$/))) return `/manager/bookings/${m[1]}`;
  if ((m = path.match(/^\/creator\/shows\/([^/]+)$/))) return `/manager/shows/${m[1]}`;
  if (path.startsWith("/creator/payments")) return "/manager/payments";
  return "/manager";
}
