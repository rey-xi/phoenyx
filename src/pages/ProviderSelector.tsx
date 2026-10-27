import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { providers } from "../hooks/providers";
import type { Provider } from "../types/api";

export function ProviderSelector() {
  const navigate = useNavigate();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [error, setError] = useState("");

  function select(provider: Provider) {
    if (pendingProvider) return;
    setPendingProvider(provider);
    setError("");
    navigate(`/mail-flow/${provider}`);
  }

  return (
    <main className="selector-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Invitation home">
          <span className="wordmark-icon" aria-hidden="true">
            S
          </span>
          <span>
            sign-in <strong>flow</strong>
          </span>
        </a>
        <span className="header-pill">
          <span /> SECURE{" "}
        </span>
      </header>

      <section className="selector-content" aria-labelledby="selector-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" /> A better way to begin
          </p>
          <h1 id="selector-title">
            Choose how
            <br />
            <span>You Sign In</span>
          </h1>
          <p className="hero-description">
            Choose your email provider to continue and receive your invitation
            details.
          </p>
        </div>

        <div className="provider-panel">
          <div
            className="provider-list mail-provider-list"
            aria-label="Mail providers"
          >
            {providers.map((provider) => (
              <button
                aria-label={provider.note}
                className={`provider-option mail-provider-option mail-provider-${provider.id}`}
                disabled={pendingProvider !== null}
                key={provider.id}
                onClick={() => void select(provider.id)}
                type="button"
              >
                <BrandMark provider={provider.id} />
                <span className="provider-option-copy">
                  <strong>{provider.name}</strong>
                  <span>{provider.note}</span>
                </span>
                {pendingProvider === provider.id ? (
                  <span
                    className="spinner provider-spinner"
                    aria-label="Opening"
                  />
                ) : (
                  <span className="provider-arrow" aria-hidden="true">
                    ↗
                  </span>
                )}
              </button>
            ))}
          </div>

          {error ? (
            <p className="selector-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="panel-footnote"></div>
        </div>
      </section>

      <footer className="site-footer">
        <span>A MORE PERSONAL WAY TO CONTINUE</span>
        <span>Your invitation is just a few steps away.</span>
      </footer>
    </main>
  );
}
