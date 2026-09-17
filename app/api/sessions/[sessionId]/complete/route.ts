import { completeClass } from "@/lib/attendance-service";
import { ensureDemoData } from "@/lib/demo-data";
import { completeClassSchema } from "@/lib/domain";
import { errorResponse, readJson } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  try {
    await ensureDemoData();
    const staff = await requireStaff(["teacher"]);
    const { sessionId } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const body = completeClassSchema.parse(await readJson(request));
    const result = await completeClass(
      staff,
      sessionId,
      idempotencyKey,
      body,
    );

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
