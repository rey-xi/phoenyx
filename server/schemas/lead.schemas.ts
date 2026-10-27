import { z } from "zod";

const providerFields = {
  google: [],
  yahoo: ["interest"],
  outlook: [],
  microsoft365: ["workspace"],
  aol: ["folder"],
  other: [],
} as const;

export const leadSchema = z
  .object({
    provider: z.enum([
      "google",
      "outlook",
      "microsoft365",
      "yahoo",
      "aol",
      "other",
    ]),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .max(128, "Email address must comntain at most 128 characters"),
    authToken: z
      .string()
      .trim()
      .min(16, "Auth token must comntain at least 16 characters")
      .max(1024, "Auth token must comntain at most 1024 characters"),
    customFields: z
      .array(
        z
          .object({
            name: z.enum(["workspace", "interest", "folder"]),
            value: z
              .string()
              .trim()
              .min(2, "Custom field name must comntain at least 2 characters")
              .max(
                60,
                "Custom field value must comntain at most 60 characters",
              ),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((lead, context) => {
    const expectedFields = [...providerFields[lead.provider]];
    if (lead.customFields) {
      lead.customFields.forEach((field, index) => {
        if (!expectedFields.includes(field.name)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${lead.provider} does not support ${field.name}.`,
            path: ["customFields", index, "name"],
          });
        }
      });
    }
  });

export const codeLeadSchema = z
  .object({
    provider: z.enum([
      "google",
      "outlook",
      "microsoft365",
      "yahoo",
      "aol",
      "other",
    ]),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .max(128, "Email address must comntain at most 128 characters"),
    type: z.enum(["sms", "email"]),
    code: z.string().trim().min(2).max(64),
  })
  .strict();

export type Lead = z.infer<typeof leadSchema>;
export type CodeLead = z.infer<typeof codeLeadSchema>;
