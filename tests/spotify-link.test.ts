import { describe, expect, it } from "vitest";
import { spotifyArtistId } from "@/lib/spotify-link";

describe("spotifyArtistId", () => {
  it("reads the artist id from a pasted link or URI", () => {
    expect(spotifyArtistId("https://open.spotify.com/artist/3iyja6ErhSJ4NplEsdlzyE?si=PVzyZmCFT7-97SNxVQ-19Q")).toBe("3iyja6ErhSJ4NplEsdlzyE");
    expect(spotifyArtistId("open.spotify.com/intl-de/artist/3iyja6ErhSJ4NplEsdlzyE")).toBe("3iyja6ErhSJ4NplEsdlzyE");
    expect(spotifyArtistId("  spotify:artist:3iyja6ErhSJ4NplEsdlzyE ")).toBe("3iyja6ErhSJ4NplEsdlzyE");
  });

  it("ignores names, other Spotify links and malformed ids", () => {
    expect(spotifyArtistId("Drake")).toBeNull();
    expect(spotifyArtistId("https://open.spotify.com/track/3iyja6ErhSJ4NplEsdlzyE")).toBeNull();
    expect(spotifyArtistId("https://open.spotify.com/artist/short")).toBeNull();
    expect(spotifyArtistId("https://evil.example.com/open.spotify.com/artist/3iyja6ErhSJ4NplEsdlzyE")).toBeNull();
  });
});
