import { Link } from "react-router-dom";
import "../styles/invitation.css";

export function InvitationCard() {
  return (
    <main className="invitation-shell card-shell">
      <div className="invitation-light" aria-hidden="true" />
      <article className="invitation-card" aria-labelledby="card-title">
        <span className="card-corner card-corner-top" aria-hidden="true" />
        <span className="card-corner card-corner-bottom" aria-hidden="true" />
        <div className="card-content">
          <p className="invitation-kicker">A personal invitation</p>
          <span className="card-star" aria-hidden="true">✳</span>
          <h1 id="card-title">You're Invited</h1>
          <h2>An Invitation to a Special Meeting</h2>
          <span className="card-divider" aria-hidden="true"><i /></span>
          <p className="invitation-body">
            You have been specially invited to an upcoming meeting. The full details, including the
            meeting date, time, venue or access information, and any additional instructions, will
            be revealed in your invitation email.
          </p>
          <p className="invitation-closing">
            We look forward to sharing this moment with you.
          </p>
          <Link className="view-card-button" to="/providers">
            View Card
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </article>
      <span className="card-edition" aria-hidden="true">WITH WARM REGARDS</span>
    </main>
  );
}
