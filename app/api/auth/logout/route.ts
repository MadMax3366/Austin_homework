import {
  expiredSessionCookie,
  readCookieHeader,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-session";
import { assertSameOrigin, errorResponse } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    await revokeSessionToken(
      readCookieHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME),
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Cache-Control": "private, no-store",
        "Set-Cookie": expiredSessionCookie(
          new URL(request.url).protocol === "https:",
        ),
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
