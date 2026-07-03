import "server-only";

import { randomUUID } from "node:crypto";
import { serviceDb } from "@/server/db/service";
import { enforceRateLimit } from "./rate-limit";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export type UploadBucket = "proofs" | "attachments" | "avatars" | "artist-images";

/**
 * All uploads flow through here (server-side) so MIME/size validation cannot
 * be bypassed. Files land under {ownerId}/{uuid}.{ext}; the stored path is
 * later exchanged for a short-lived signed URL after a permission check.
 */
export async function uploadFile(
  bucket: UploadBucket,
  ownerId: string,
  file: File,
): Promise<string> {
  await enforceRateLimit("upload.file", ownerId);

  const allowed = bucket === "avatars" || bucket === "artist-images" ? IMAGE_MIME : ALLOWED_MIME;
  if (!allowed.has(file.type)) {
    throw new Error(`File type ${file.type || "unknown"} is not allowed`);
  }
  if (file.size === 0) throw new Error("File is empty");
  if (file.size > MAX_BYTES) throw new Error("File exceeds the 10 MB limit");

  const ext =
    file.type === "image/jpeg" ? "jpg"
    : file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : "pdf";
  const path = `${ownerId}/${randomUUID()}.${ext}`;

  const { error } = await serviceDb()
    .storage.from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Signed URL for a private file. Caller must have already checked access. */
export async function signedFileUrl(
  bucket: UploadBucket,
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const { data } = await serviceDb()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

export async function signedFileUrls(
  bucket: UploadBucket,
  paths: string[],
): Promise<{ path: string; url: string | null }[]> {
  return Promise.all(
    paths.map(async (path) => ({ path, url: await signedFileUrl(bucket, path) })),
  );
}

/** Public URL for display assets (avatars, artist imagery). */
export function publicFileUrl(bucket: "avatars" | "artist-images", path: string): string {
  const { data } = serviceDb().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
