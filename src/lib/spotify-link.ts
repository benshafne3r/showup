/**
 * The artist id in a pasted Spotify artist link or URI, e.g.
 * https://open.spotify.com/artist/3iyja6ErhSJ4NplEsdlzyE?si=… (also with an
 * /intl-xx/ segment) or spotify:artist:3iyja6ErhSJ4NplEsdlzyE. Null otherwise.
 */
export function spotifyArtistId(input: string): string | null {
  const text = input.trim();
  const match =
    text.match(/^spotify:artist:([A-Za-z0-9]{22})$/) ??
    text.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return match?.[1] ?? null;
}
