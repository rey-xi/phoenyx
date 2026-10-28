import z from "zod";

export const deviceSchema = z.object(
  {
    clientId: z
      .string({
        required_error: "clientId is required.",
        invalid_type_error: "clientId must be a string.",
      })
      .uuid({ message: "clientId must be a valid UUID." }),

    fingerprint: z
      .string({
        required_error: "fingerprint is required.",
        invalid_type_error: "fingerprint must be a string.",
      })
      .length(64, {
        message: "fingerprint must be exactly 64 hex characters (SHA-256).",
      }),

    components: z.record(
      z.union([z.string(), z.number(), z.boolean()], {
        errorMap: () => ({
          message: "components values must be string, number, or boolean.",
        }),
      }),
      {
        required_error: "components is required.",
        invalid_type_error: "components must be an object of component values.",
      },
    ),

    userAgent: z
      .string({
        required_error: "userAgent is required.",
        invalid_type_error: "userAgent must be a string.",
      })
      .min(1, { message: "userAgent cannot be empty." })
      .max(1024, { message: "userAgent must be at most 1024 characters." }),

    userAgentData: z
      .object({
        platform: z
          .string({
            invalid_type_error: "userAgentData.platform must be a string.",
          })
          .optional(),
        mobile: z
          .boolean({
            invalid_type_error: "userAgentData.mobile must be a boolean.",
          })
          .optional(),
        brands: z
          .array(
            z.object({
              brand: z.string({
                required_error: "Each brand entry must include a brand name.",
                invalid_type_error: "brand must be a string.",
              }),
              version: z.string({
                required_error: "Each brand entry must include a version.",
                invalid_type_error: "version must be a string.",
              }),
            }),
            {
              invalid_type_error: "userAgentData.brands must be an array.",
            },
          )
          .optional(),
      })
      .optional(),

    capturedAt: z
      .string({
        required_error: "capturedAt is required.",
        invalid_type_error: "capturedAt must be a string.",
      })
      .datetime({
        message:
          "capturedAt must be an ISO 8601 datetime (e.g., 2026-10-27T12:00:00.000Z).",
      }),
  },
  {
    required_error: "Request body is required.",
    invalid_type_error: "Request body must be a JSON object.",
  },
);

export type Device = z.infer<typeof deviceSchema>;
