import { z } from "zod";

import {
  createCredentialSession,
  sessionCookie,
} from "@/lib/auth-session";
import { errorResponse, assertSameOrigin, readJson } from "@/lib/http";

const loginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await readJson(request));
    const session = await createCredentialSession(input.email, input.password);
    return Response.json(
      { ok: true, redirectTo: "/" },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": sessionCookie(
            session.token,
            new URL(request.url).protocol === "https:",
          ),
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
