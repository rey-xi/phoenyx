import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { devicePostHandler } from "../handlers/device.handlers.js";

const router = Router();

router.post(
  "/",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
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
  devicePostHandler,
);

export default router;
