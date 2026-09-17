import { ensureDemoData } from "@/lib/demo-data";
import { feedbackRequestSchema } from "@/lib/domain";
import { draftFeedback } from "@/lib/feedback-service";
import { errorResponse, readJson } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureDemoData();
    const staff = await requireStaff(["teacher"]);
    const body = feedbackRequestSchema.parse(await readJson(request));
    const result = await draftFeedback(
      staff,
      body.sessionId,
      body.rawNotes,
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
