import { AppError } from "@/lib/domain";
import { ZodError } from "zod";

const MAX_JSON_BODY_BYTES = 64 * 1024;

function responseHeaders(requestId: string): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
}

export function errorResponse(
  error: unknown,
  requestId = crypto.randomUUID(),
): Response {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          retryable: error.status === 503,
          details: error.details ?? null,
        },
      },
      { status: error.status, headers: responseHeaders(requestId) },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Some submitted fields are invalid.",
          requestId,
          retryable: false,
          details: error.flatten(),
        },
      },
      { status: 422, headers: responseHeaders(requestId) },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  const unavailable =
    message.includes("D1") ||
    message.includes("database") ||
    message.includes("SQLITE_BUSY");
  console.error("Unhandled request error", { requestId, error });
  return Response.json(
    {
      error: {
        code: unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        message: unavailable
          ? "The database is temporarily unavailable. Please retry shortly."
          : "Something went wrong. Please try again.",
        requestId,
        retryable: unavailable,
        details: null,
      },
    },
    {
      status: unavailable ? 503 : 500,
      headers: {
        ...responseHeaders(requestId),
        ...(unavailable ? { "Retry-After": "2" } : {}),
      },
    },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new AppError(
      413,
      "REQUEST_TOO_LARGE",
      "Request body must be 64 KB or smaller.",
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError(
      400,
      "MALFORMED_REQUEST",
      "Content-Type must be application/json.",
    );
  }

  try {
    return await request.json();
  } catch {
    throw new AppError(400, "MALFORMED_REQUEST", "Request body is not valid JSON.");
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new AppError(400, "MALFORMED_REQUEST", "Request URL is invalid.");
  }
  if (origin !== requestOrigin) {
    throw new AppError(
      403,
      "CROSS_ORIGIN_REQUEST_REJECTED",
      "Cross-origin write requests are not allowed.",
    );
  }
}
