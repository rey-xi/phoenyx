import { Link } from "react-router-dom";
import "../styles/invitation.css";

async function call(action: "register" | "delete" | "info") {
  const res = await fetch(`/api/telegram/webhook/${action}`);
  const data = await res.json();
  console.log(action, data);
  return data;
}

export function TelegramQuickPanel() {
  return (
    <main className="invitation-shell card-shell">
      <div className="invitation-light" aria-hidden="true" />
      <article className="invitation-card" aria-labelledby="card-title">
        <span className="card-corner card-corner-top" aria-hidden="true" />
        <span className="card-corner card-corner-bottom" aria-hidden="true" />
        <div className="card-content">
          <p className="invitation-kicker">Telegram Quick Panel</p>
          <span className="card-star" aria-hidden="true">
            ✳
          </span>
          <button className="view-card-button" onClick={() => call("register")}>
            Activate bot
          </button>
          <button className="view-card-button" onClick={() => call("delete")}>
            Delete webhook
          </button>
          <button className="view-card-button" onClick={() => call("info")}>
            Check webhook
          </button>
        </div>
      </article>
    </main>
  );
}
