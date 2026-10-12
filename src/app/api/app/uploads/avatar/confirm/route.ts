import { db } from "@/lib/db";
import { appReady, publicUser, type AppUser } from "@/lib/app/schema";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";
import { deleteObject, isOwnAvatarKey, objectSize, storageConfigured } from "@/lib/app/storage";

// Profile picture, step 2 of 2: once the PUT succeeded, point the profile at the new key and
// delete the previous picture. app_users.photo stores the key; the API returns it as a URL.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (!storageConfigured()) return fail("Storage is not configured", 503);
  const key = str((await body(req)).key, 200);
  if (!isOwnAvatarKey(key, user.id)) return fail("Invalid key");
  if ((await objectSize(key)) == null) return fail("The photo hasn't been uploaded yet. Please try again.");
  await appReady();
  const rows = await db()`update app_users set photo = ${key} where id = ${user.id} returning *`;
  const previous = user.photo;
  if (previous && previous !== key && isOwnAvatarKey(previous, user.id)) {
    await deleteObject(previous).catch((e) => console.error("[storage] couldn't delete the old avatar", previous, e));
  }
  return Response.json({ user: publicUser(rows[0] as AppUser) });
});
