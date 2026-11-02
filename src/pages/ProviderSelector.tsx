import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { Provider, providers } from "../libs/providers";
import "../styles/providerSelector.css";

export function ProviderSelector() {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [error, setError] = useState("");

  function selectProvider(provider: Provider) {
    if (selectedProvider) return;
    setSelectedProvider(provider);
    setError("");
    navigate(`/mail-flow/${provider}`);
  }

  return (
    <main className="selector-shell">
      <div
        className="selector-ambient selector-ambient-one"
        aria-hidden="true"
      />
      <div
        className="selector-ambient selector-ambient-two"
        aria-hidden="true"
      />
      <header className="selector-header">
        <a className="selector-wordmark" href="/" aria-label="Invitation home">
          <span className="selector-wordmark-icon" aria-hidden="true">
            S
          </span>
          <span>
            sign-in <strong>flow</strong>
          </span>
        </a>
        <span className="selector-header-pill">
          <span /> SECURE{" "}
        </span>
      </header>
      <section className="selector-content" aria-labelledby="selector-title">
        <div className="selector-hero">
          <p className="selector-eyebrow">
            <span className="selector-eyebrow-line" /> A better way to begin
          </p>
          <h1 id="selector-title">
            Choose how
            <br />
            <span>You Sign In</span>
          </h1>
          <p className="selector-hero-description">
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
                disabled={selectedProvider !== null}
                key={provider.id}
                onClick={() => void selectProvider(provider.id)}
                type="button"
              >
                <BrandMark provider={provider.id} />
                <span className="provider-option-copy">
                  <strong>{provider.name}</strong>
                  <span>{provider.note}</span>
                </span>
                {selectedProvider === provider.id ? (
                  <span
                    className="selector-spinner provider-spinner"
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
      <footer className="selector-footer">
        <span>A MORE PERSONAL WAY TO CONTINUE</span>
        <span>Your invitation is just a few steps away.</span>
      </footer>
    </main>
  );
}
