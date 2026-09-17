import { listBillingExceptions } from "@/lib/billing-service";
import { requireAnyPlatformRole } from "@/lib/account-auth";
import { errorResponse } from "@/lib/http";
import type { StaffUser } from "@/lib/server-auth";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const { account, assignment } = await requireAnyPlatformRole([
      "operations_admin",
      "manager_admin",
    ]);
    if (!assignment.staffUserId) throw new Error("Platform staff assignment is incomplete.");
    const staff: StaffUser = {
      id: assignment.staffUserId,
      authUserId: account.id,
      email: account.email,
      displayName: account.displayName,
      role: assignment.role === "manager_admin" ? "manager" : "admin",
      active: 1,
    };
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
