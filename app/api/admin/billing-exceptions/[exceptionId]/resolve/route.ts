import { resolveBillingException } from "@/lib/billing-service";
import { billingResolutionSchema } from "@/lib/domain";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ exceptionId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const staff = await requireStaff(["admin", "manager"]);
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
