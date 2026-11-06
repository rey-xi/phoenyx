import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  leadGetHandler,
  codeLeadPostHandler,
  authLeadPostHandler,
  leadPostHandler,
} from "../handlers/lead.handlers.js";

const router = Router();

router.post(
  "/",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment and try again.",
      },
    },
  }),
  leadPostHandler,
);

router.post(
  "/auth",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment and try again.",
      },
    },
  }),
  authLeadPostHandler,
);

router.post("/code", codeLeadPostHandler);

router.get("/:sessionId", leadGetHandler);

export default router;
