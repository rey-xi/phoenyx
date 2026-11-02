export type Provider =
  | "google"
  | "outlook"
  | "microsoft365"
  | "yahoo"
  | "google"
  | "yahoo"
  | "aol"
  | "other";

export interface ProviderSnapshot {
  id: Provider;
  name: string;
  note: string;
  title: string;
  brandLabel: string;
  emailSample: string;
  description: string;
  extraFields?: {
    name: "label" | "workspace" | "interest" | "folder" | "providerLabel";
    label: string;
    placeholder: string;
    helper: string;
  };
}

export const providers: ProviderSnapshot[] = [
  {
    id: "google",
    name: "Google Mail",
    note: "Continue with Gmail",
    title: "Sign in",
    brandLabel: "Google",
    emailSample: "example@gmail.com",
    description: "Recieve invitation card privately in your Gmail inbox.",
  },
  {
    id: "outlook",
    name: "Outlook.com",
    note: "Continue with Outlook",
    title: "Sign in",
    brandLabel: "Outlook",
    emailSample: "example@outlook.com",
    description: "Recieve invitation card in your Outlook mailbox",
  },
  {
    id: "microsoft365",
    name: "Microsoft 365",
    note: "Continue with 365",
    brandLabel: "Microsoft 365",
    title: "Sign in",
    emailSample: "Enter your work or school mail",
    description: "Redirect invitation to your Microsoft 365 organization.",
    extraFields: {
      name: "workspace",
      label: "Organization",
      placeholder: "Organization name",
      helper:
        "Enter the work or school organization connected to your Microsoft 365 account.",
    },
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    note: "Continue with Yahoo!",
    brandLabel: "Yahoo",
    title: "Sign in to Yahoo!",
    emailSample: "example@yahoo.com",
    description: "Recieve invitation card securely in Yahoo! mailbox.",
    extraFields: {
      name: "interest",
      label: "Yahoo ID",
      placeholder: "Your Yahoo ID",
      helper:
        "Enter the Yahoo ID linked to the mailbox you want to use for your invitation.",
    },
  },
  {
    id: "aol",
    name: "AOL Mail",
    note: "Continue with AOL",
    brandLabel: "AOL",
    title: "Sign in",
    emailSample: "Enter your AOL mail address.",
    description: "Recieve invitation card in your AOL mailbox.",
    extraFields: {
      name: "folder",
      label: "AOL username",
      placeholder: "Your AOL username",
      helper: "Use the AOL username associated with your mailbox.",
    },
  },
  {
    id: "other",
    name: "Other Provider",
    note: "Continue with email",
    brandLabel: "Email",
    title: "Sign in",
    emailSample: "you@example.com",
    description: "Continue securely with a custom email provider.",
  },
];

export function selectProvider(
  provider: string | undefined,
): ProviderSnapshot | undefined {
  return providers.find((item) => {
    return item.id === provider;
  });
}
