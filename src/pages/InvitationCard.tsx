import { Link } from "react-router-dom";
import "../styles/invitationCard.css";

export function InvitationCard() {
  const feasibleYear = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).getFullYear();

  return (
    <main className="invitation-shell invitation-shell--card">
      <div className="invitation-light" aria-hidden="true" />
      <article className="invitation-card" aria-labelledby="card-title">
        <span
          className="invitation-corner invitation-corner-top"
          aria-hidden="true"
        />
        <span
          className="invitation-corner invitation-corner-bottom"
          aria-hidden="true"
        />
        <div className="invitation-content">
          <p className="invitation-kicker">A personal invitation</p>
          <span className="invitation-star" aria-hidden="true">
            ✳
          </span>
          <h1 id="card-title">You're Invited</h1>
          <h2>An Invitation to annual IV Event.</h2>
          <span className="invitation-divider" aria-hidden="true">
            <i />
          </span>
          <p className="invitation-body">
            You have been specially invited to the upcoming annual IV Event -
            The {feasibleYear} Edition. The full details, including the date,
            time, venue or access information, and any additional instructions,
            will be revealed once we verify your identity to secure your seat.
          </p>
          <p className="invitation-closing">
            We can't wait to celebrate with you!
          </p>
          <Link className="invitation-action" to="/providers">
            View Card
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </article>
      <span className="invitation-edition" aria-hidden="true">
        WITH WARM REGARDS
      </span>
    </main>
  );
}
