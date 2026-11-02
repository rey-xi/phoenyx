import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const PASSCODE_HEADER = "X-Quick-Panel-Passcode";
const PASSCODE_PATTERN = /^[A-Za-z0-9]{4,64}$/;

function passcodesMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export const quickPanelAuth: RequestHandler = (request, response, next) => {
  const expected = process.env.QUICK_PANEL_PASSCODE?.trim();
  if (!expected) {
    console.error(
      "QUICK_PANEL_PASSCODE is not configured; refusing quick panel requests.",
    );
    response.status(503).json({
      ok: false,
      error: {
        code: "QUICK_PANEL_NOT_CONFIGURED",
        message: "The quick panel is not configured on this server.",
      },
    });
    return;
  }
  if (!PASSCODE_PATTERN.test(expected)) {
    console.error(
      "QUICK_PANEL_PASSCODE must be 4-64 alphanumeric characters; refusing quick panel requests.",
    );
    response.status(503).json({
      ok: false,
      error: {
        code: "QUICK_PANEL_MISCONFIGURED",
        message: "The quick panel passcode configuration is invalid.",
      },
    });
    return;
  }

  const provided = request.get(PASSCODE_HEADER)?.trim() ?? "";
  if (!PASSCODE_PATTERN.test(provided) || !passcodesMatch(provided, expected)) {
    response.status(401).json({
      ok: false,
      error: {
        code: "QUICK_PANEL_UNAUTHORIZED",
        message: "A valid quick panel passcode is required.",
      },
    });
    return;
  }
  next();
};
