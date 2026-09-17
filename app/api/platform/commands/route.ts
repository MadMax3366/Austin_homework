import {
  type PlatformRole,
  requirePlatformRole,
} from "@/lib/account-auth";
import { executePlatformCommand } from "@/lib/platform-commands";
import { AppError, platformCommandSchema } from "@/lib/domain";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";

const roles: PlatformRole[] = [
  "teacher",
  "operations_admin",
  "manager_admin",
  "student",
  "guardian",
  "system_admin",
];

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const role = new URL(request.url).searchParams.get("role") as PlatformRole;
    if (!roles.includes(role)) {
      throw new AppError(400, "INVALID_WORKSPACE_ROLE", "Workspace role is invalid.");
    }
    const { account, assignment } = await requirePlatformRole(role);
    const command = platformCommandSchema.parse(await readJson(request));
    const result = await executePlatformCommand(
      { account, assignment, role },
      command,
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
