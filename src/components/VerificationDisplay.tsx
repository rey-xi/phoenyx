import { FormEvent, useEffect, useRef, useState } from "react";

type Kind = "email-link" | "email-code" | "sms-code";

type VerificationPageProp = {
  kind: Kind;
  provider?: string;
  address?: string;
  codeLength?: number;
};

const content: Record<
  Kind,
  {
    title: string;
    description: (provider: string, address: string) => string;
    icon?: string;
  }
> = {
  "email-link": {
    title: "Check your inbox",
    description: (provider, address) => {
      return `Click the link ${provider.toLocaleUpperCase()} sent to ${address}`;
    },
    icon: "✉",
  },
  "email-code": {
    title: "Check your inbox",
    description: (provider, address) => {
      return `Enter the code ${provider.toLocaleUpperCase()} sent to ${address}`;
    },
  },
  "sms-code": {
    title: "Verify SMS code",
    description: (provider, address) => {
      return `Enter the code ${provider.toLocaleUpperCase()} sent to ${address}`;
    },
  },
};

export function VerificationDisplay({
  kind,
  provider,
  address,
  codeLength,
}: VerificationPageProp) {
  provider = provider ?? "Sign-in Flow";
  address =
    address ??
    (kind === "email-link" || kind === "email-code"
      ? "your email address"
      : "your phone number");
  const fixedCodeLength = codeLength ?? (provider === "Sign-in Flow" ? 4 : 6);

  const page = content[kind];
  const isOtpType = kind === "email-code" || kind === "sms-code";

  return (
    <main className="verification">
      <style>{`
      `}</style>
    </main>
  );
}
