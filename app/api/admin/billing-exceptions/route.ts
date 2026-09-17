import { listBillingExceptions } from "@/lib/billing-service";
import { errorResponse } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const staff = await requireStaff(["admin", "manager"]);
    const items = await listBillingExceptions(staff);
    return Response.json(
      { items },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
