import type { Provider } from "../../libs/providers";
import "../../styles/components/brandMark.css";

interface BrandMarkProps {
  provider: Provider;
  compact?: boolean;
}

export function BrandMark({ provider, compact = false }: BrandMarkProps) {
  if (provider === "google") {
    return (
      <span
        className={`brand-mark google-mark${compact ? " compact" : ""}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" role="presentation">
          <path
            fill="#4285F4"
            d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
          />
          <path
            fill="#34A853"
            d="M24 44c5.5 0 10.2-1.8 13.6-4.8l-6.7-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.2A20 20 0 0 0 24 44Z"
          />
          <path
            fill="#FBBC05"
            d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H5.7a20 20 0 0 0 0 17.8l6.9-5.2Z"
          />
          <path
            fill="#EA4335"
            d="M24 11.9c3 0 5.7 1 7.8 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.7 15.1l6.9 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"
          />
        </svg>
      </span>
    );
  }
  if (provider === "outlook" || provider === "microsoft365") {
    return (
      <span
        className={`brand-mark microsoft-mark${compact ? " compact" : ""}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" role="presentation">
          <path fill="#F25022" d="M4 4h19v19H4z" />
          <path fill="#7FBA00" d="M25 4h19v19H25z" />
          <path fill="#00A4EF" d="M4 25h19v19H4z" />
          <path fill="#FFB900" d="M25 25h19v19H25z" />
        </svg>
      </span>
    );
  }
  if (provider === "yahoo") {
    return (
      <span
        className={`brand-mark yahoo-mark${compact ? " compact" : ""}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" role="presentation">
          <path
            fill="currentColor"
            d="M7 10h9l8 13 8-13h9L28 30v9h-8v-9L7 10Zm25 21h9v8h-9v-8Z"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className={`brand-mark ${provider}-mark`} aria-hidden="true">
      {provider === "aol" ? <strong>aol</strong> : <span>✉</span>}
    </span>
  );
}
