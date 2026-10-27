type LoadingOverlayProps = {
  message: string;
};

export function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <div
      className="flow-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flow-overlay-title"
      aria-live="polite"
    >
      <section className="flow-overlay-card">
        <span className="flow-spinner" aria-hidden="true" />

        <h2 id="flow-overlay-title">Please wait</h2>

        <p>{message || "Processing your request…"}</p>

        <span className="flow-connection">{"Processing securely"}</span>
      </section>
    </div>
  );
}
