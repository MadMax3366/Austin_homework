import { requirePlatformAccount } from "@/lib/account-auth";
import { errorResponse } from "@/lib/http";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const account = await requirePlatformAccount();
    return Response.json(account, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
