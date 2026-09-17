import { feedbackRequestSchema } from "@/lib/domain";
import { draftFeedback } from "@/lib/feedback-service";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const staff = await requireStaff(["teacher"]);
    assertSameOrigin(request);
    const body = feedbackRequestSchema.parse(await readJson(request));
    const result = await draftFeedback(
      staff,
      body.sessionId,
      body.rawNotes,
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
