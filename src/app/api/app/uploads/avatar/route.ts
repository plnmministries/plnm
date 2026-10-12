import { body, fail, handler, num, requireUser } from "@/lib/app/http";
import { AVATAR_MAX_BYTES, avatarKey, presignUpload, storageConfigured } from "@/lib/app/storage";

// Profile picture, step 1 of 2: a 5-minute presigned PUT for avatars/{userId}/{version}.jpg.
// The phone resizes the photo (JPEG, ~512 px is plenty), sends `size` = its byte length, PUTs the
// bytes to upload.url with exactly upload.headers, then calls POST /api/app/uploads/avatar/confirm with `key`.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (!storageConfigured()) return fail("Storage is not configured", 503);
  const size = num((await body(req)).size);
  if (size == null || !Number.isInteger(size) || size <= 0) return fail("Send the photo's size in bytes as `size`");
  if (size > AVATAR_MAX_BYTES) return fail("Photo is too large (max 2 MB). Please pick a smaller one.");
  const key = avatarKey(user.id, Date.now().toString(36));
  const upload = await presignUpload(key, "image/jpeg", AVATAR_MAX_BYTES, size);
  return Response.json({ upload, key, confirm: "/api/app/uploads/avatar/confirm" });
});
