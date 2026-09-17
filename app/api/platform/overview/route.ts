import {
  type PlatformRole,
  requirePlatformRole,
} from "@/lib/account-auth";
import { AppError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import { getPlatformOverview } from "@/lib/platform-overview";

const supportedRoles: PlatformRole[] = [
  "operations_admin",
  "manager_admin",
  "student",
  "guardian",
  "system_admin",
];

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const search = new URL(request.url).searchParams;
    const role = search.get("role") as PlatformRole;
    if (!supportedRoles.includes(role)) {
      throw new AppError(400, "INVALID_WORKSPACE_ROLE", "Workspace role is invalid.");
    }
    const studentQuery = (search.get("studentQuery") ?? "").trim();
    if (studentQuery.length > 80) {
      throw new AppError(
        400,
        "STUDENT_QUERY_TOO_LONG",
        "Student search must be 80 characters or fewer.",
      );
    }
    const studentPageRaw = search.get("studentPage") ?? "1";
    if (!/^\d+$/.test(studentPageRaw)) {
      throw new AppError(400, "INVALID_STUDENT_PAGE", "Student page is invalid.");
    }
    const studentPage = Number(studentPageRaw);
    if (!Number.isSafeInteger(studentPage) || studentPage < 1 || studentPage > 10_000) {
      throw new AppError(400, "INVALID_STUDENT_PAGE", "Student page is invalid.");
    }
    const { account, assignment } = await requirePlatformRole(role);
    const overview = await getPlatformOverview(
      role,
      account,
      assignment,
      {
        selectedStudentId: search.get("studentId"),
        studentQuery,
        studentPage,
      },
    );
    return Response.json(overview, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
