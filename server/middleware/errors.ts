import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested API endpoint was not found.",
    },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }
  console.error("Unhandled API error", error);
  response.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  });
};
