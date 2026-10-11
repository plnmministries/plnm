import "server-only";
import { userFromRequest } from "./auth";
import type { AppUser } from "./schema";

export const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Signed-in user or a 401. */
export async function requireUser(req: Request, roles?: AppUser["role"][]): Promise<AppUser> {
  const user = await userFromRequest(req);
  if (!user) throw new HttpError(401, "Please sign in again");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "Not allowed");
  return user;
}

/** Wraps a handler so thrown HttpErrors (and anything else) become JSON responses. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
      console.error("[app-api]", e);
      return fail("Something went wrong. Please try again.", 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

export const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(Number(v)) ? Number(v) : null);
