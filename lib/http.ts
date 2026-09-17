import { AppError } from "@/lib/domain";
import { ZodError } from "zod";

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Some submitted fields are invalid.",
          details: error.flatten(),
        },
      },
      { status: 422 },
    );
  }

  console.error("Unhandled request error", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        details: null,
      },
    },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
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
