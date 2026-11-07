import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/components/animatedEnvelope.css";

export function AnimatedEnvelope() {
  const navigate = useNavigate();
  const navigationStarted = useRef(false);
  const envelopeRef = useRef<HTMLDivElement | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const fallbackTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (fallbackTimer.current !== undefined) {
        window.clearTimeout(fallbackTimer.current);
      }
    },
    [],
  );

  function finishOpening() {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    if (fallbackTimer.current !== undefined) {
      window.clearTimeout(fallbackTimer.current);
    }
    navigate("/invitation");
  }

  function handleOpen() {
    if (isOpening) return;

    if (envelopeRef.current) {
      envelopeRef.current.style.transform = "translateY(26px)";
      envelopeRef.current.style.transition = "transform 700ms ease";
    }

    setIsOpening(true);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    fallbackTimer.current = window.setTimeout(
      finishOpening,
      reducedMotion ? 100 : 2500,
    );
  }

  return (
    <div className="envelope-stage">
      <div
        ref={envelopeRef}
        className={`envelope${isOpening ? " is-opening" : ""}`}
        aria-label="A sealed invitation envelope"
        style={{
          transform: isOpening
            ? "translateY(min(124px, 15vh))"
            : "translateY(0)",
          transition: "transform 700ms ease",
        }}
      >
        <div className="envelope-back" aria-hidden="true" />
        <svg
          className="envelope-flap-layer"
          viewBox="0 0 360 220"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="envelope-flap-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f6ead5" />
              <stop offset="1" stopColor="#dfc9a6" />
            </linearGradient>
          </defs>
          <path d="M8 22h344L180 145z" fill="url(#envelope-flap-fill)" />
          <path
            d="M8 22 180 145 352 22"
            fill="none"
            stroke="#cbb38d"
            strokeOpacity=".52"
          />
        </svg>
        <div
          className="invitation-letter"
          aria-hidden="true"
          onAnimationEnd={finishOpening}
        >
          <span className="letter-ornament">S</span>
          <span className="letter-rule" />
          <span className="letter-rule letter-rule-short" />
        </div>
        <svg
          className="envelope-front"
          viewBox="0 0 360 220"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="envelope-paper" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f5e8d0" />
              <stop offset=".52" stopColor="#ead8b9" />
              <stop offset="1" stopColor="#d9c29c" />
            </linearGradient>
            <linearGradient id="envelope-fold" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#e9d5b3" />
              <stop offset="1" stopColor="#d7c09a" />
            </linearGradient>
          </defs>
          <path d="M8 22 180 139 352 22v198H8z" fill="url(#envelope-fold)" />
          <path d="m8 22 172 120L8 220z" fill="#dfc9a8" />
          <path d="m352 22-172 120 172 78z" fill="#ead9bc" />
          <path
            d="M8 220 142 112l38 30 38-30 134 108z"
            fill="url(#envelope-paper)"
          />
        </svg>
        <button
          aria-label={
            isOpening ? "Opening invitation" : "Open invitation envelope"
          }
          className="envelope-seal"
          disabled={isOpening}
          onClick={handleOpen}
          type="button"
        >
          <span className="seal-mark" aria-hidden="true">
            ✦
          </span>
        </button>
      </div>
    </div>
  );
}
