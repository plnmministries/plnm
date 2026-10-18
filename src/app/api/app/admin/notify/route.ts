import { notify } from "@/lib/app/push";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

export const POST = handler(async (req) => {
  await requireUser(req, ["admin"]);
  const b = await body(req);
  const title = str(b.title, 100);
  if (!title) return fail("Please add a title");
  const sent = await notify(b.audience === "volunteers" ? "volunteers" : "all", title, str(b.body, 300), { kind: "custom" });
  return Response.json({ sent });
});
