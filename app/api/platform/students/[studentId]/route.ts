import { requireAnyPlatformRole } from "@/lib/account-auth";
import { errorResponse } from "@/lib/http";
import { loadStudentDetail } from "@/lib/student-detail";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireAnyPlatformRole(["operations_admin", "manager_admin"]);
    const { studentId } = await params;
    const detail = await loadStudentDetail(studentId);
    return Response.json(detail, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
