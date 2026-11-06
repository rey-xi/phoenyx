import { AnimatedEnvelope } from "./components/AnimatedEnvelope";
import "../styles/invitationLanding.css";

export function InvitationLanding() {
  const currentYear = new Date().getFullYear();

  return (
    <main className="invitation-shell landing-shell">
      <div className="invitation-light" aria-hidden="true" />
      <div className="invitation-frame" aria-hidden="true">
        <span />
        <span />
      </div>
      <section className="landing-content" aria-labelledby="landing-title">
        <p className="invitation-kicker">You are specially invited</p>
        <h1 className="landing-title" id="landing-title">
          Annual
          <span>Gala Night</span>
        </h1>
        <AnimatedEnvelope />
        <p className="envelope-instruction">Tap the seal to view your card</p>
      </section>
      <span className="landing-edition" aria-hidden="true">
        The {currentYear} Edition
      </span>
    </main>
  );
}
