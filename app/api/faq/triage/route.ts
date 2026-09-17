import { requirePlatformRole } from "@/lib/account-auth";
import { AppError, faqQuestionSchema } from "@/lib/domain";
import { triageFaqQuestion } from "@/lib/faq-service";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const role = new URL(request.url).searchParams.get("role");
    if (role !== "student" && role !== "guardian") {
      throw new AppError(400, "INVALID_WORKSPACE_ROLE", "FAQ workspace role is invalid.");
    }
    const { account, assignment } = await requirePlatformRole(role);
    const input = faqQuestionSchema.parse(await readJson(request));
    const result = await triageFaqQuestion(account, assignment, input);
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
