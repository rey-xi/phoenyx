import { RequestHandler } from "express";
import { deviceSchema } from "../schemas/device.schema.js";
import { secureDeviceSlot } from "../methods/device.methods.js";

export const devicePostHandler: RequestHandler = async (request, response) => {
  const device = deviceSchema.safeParse(request.body);
  if (!device.success) {
    response.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: device.error.issues[0].message,
      },
    });
    return;
  }
  try {
    const deviceSlot = await secureDeviceSlot(device.data);
    const deviceStatus = {
      known: "Known Device",
      migrated: "Migrated Known Device",
      new: "NEW DEVICE",
    } as const;
    const deviceSummary = [
      `Status: ${deviceStatus[deviceSlot.status]}`,
      `Match: ${deviceSlot.trustScore.toFixed(2)}`,
      `UA: ${device.data.userAgent.slice(0, 80)}`,
      `Screen: ${device.data.components.screen}`,
      `TZ: ${device.data.components.timezone}`,
    ].join("\n");
    response.status(202).json(deviceSlot.trustScore);
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
