import { errorResponse } from "@/lib/http";
import { requireStaff } from "@/lib/server-auth";
import { loadTeacherWorkspace } from "@/lib/workspace-data";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const staff = await requireStaff(["teacher"]);
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    const workspace = await loadTeacherWorkspace(staff, sessionId);

    return Response.json(workspace, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
