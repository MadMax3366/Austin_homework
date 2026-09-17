import { resolveBillingException } from "@/lib/billing-service";
import { requireAnyPlatformRole } from "@/lib/account-auth";
import { billingResolutionSchema } from "@/lib/domain";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import type { StaffUser } from "@/lib/server-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ exceptionId: string }> },
): Promise<Response> {
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
    assertSameOrigin(request);
    const { exceptionId } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const input = billingResolutionSchema.parse(await readJson(request));
    const result = await resolveBillingException(
      staff,
      exceptionId,
      idempotencyKey,
      input,
    );
    return Response.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
