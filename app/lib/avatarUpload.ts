// Client-side prep for an uploaded profile photo: center-cropped to a
// square and downsized via <canvas> before it ever leaves the device, then
// uploaded to the "avatars" Storage bucket (migration 0024) at a fixed
// per-account path, so a re-upload just replaces the old file in place —
// nothing orphans in the bucket. Browser-only (canvas, createImageBitmap).

import type { SupabaseClient } from "@supabase/supabase-js";

// A generous sanity cap on the *source* file before decoding it at all —
// the bucket's own 5 MB limit (migration 0024) applies to what actually
// gets uploaded, which is always much smaller than this once re-encoded.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const OUTPUT_SIZE = 512; // px, square
const OUTPUT_JPEG_QUALITY = 0.85;

export class InvalidAvatarFileError extends Error {}

/** Loads an image file, center-crops it to a square, downsizes it to
 * OUTPUT_SIZE, and re-encodes as JPEG — keeps every upload small and a
 * consistent shape regardless of what the player originally picked. */
async function prepareAvatarBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new InvalidAvatarFileError("That file isn't an image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new InvalidAvatarFileError("That image is too large — try one under 20 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new InvalidAvatarFileError("Couldn't read that image — try a different file.");
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new InvalidAvatarFileError("Couldn't process that image.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", OUTPUT_JPEG_QUALITY)
    );
    if (!blob) throw new InvalidAvatarFileError("Couldn't process that image.");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Resizes/crops `file` and uploads it as the signed-in account's avatar
 * photo, overwriting whatever was there before. Returns the Storage path to
 * save on the leaderboard_entries row (see updateLeaderboardAvatarPhoto in
 * leaderboardStore.ts) — the caller still has to save that path, this only
 * gets the file into the bucket. */
export async function uploadAvatarPhoto(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const blob = await prepareAvatarBlob(file);
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}
