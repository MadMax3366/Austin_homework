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
    const { account, assignment } = await requirePlatformRole(role);
    const overview = await getPlatformOverview(
      role,
      account,
      assignment,
      search.get("studentId"),
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
