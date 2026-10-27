import { useState } from "react";
import "../styles/invitation.css";

type Action = "register" | "delete" | "info";

type PanelState =
  | { status: "idle" }
  | { status: "loading"; action: Action }
  | { status: "ok"; action: Action; data: unknown }
  | { status: "error"; action: Action; message: string };

async function call(action: Action) {
  const res = await fetch(`/api/telegram/webhook/${action}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ?? `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function TelegramQuickPanel() {
  const [state, setState] = useState<PanelState>({ status: "idle" });

  async function run(action: Action) {
    setState({ status: "loading", action });
    try {
      const data = await call(action);
      setState({ status: "ok", action, data });
    } catch (err) {
      setState({
        status: "error",
        action,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const busy = state.status === "loading";

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

          <div className="panel-result-slot">
            {state.status === "idle" && (
              <p className="panel-hint">
                Manage your bot&apos;s webhook from here.
              </p>
            )}

            {state.status === "loading" && (
              <p className="panel-hint panel-hint--loading">
                {labelFor(state.action)}…
              </p>
            )}

            {state.status === "error" && (
              <div className="panel-result panel-result--error" role="alert">
                <p className="panel-result-title">
                  {labelFor(state.action)} failed
                </p>
                <p className="panel-result-body">{state.message}</p>
              </div>
            )}

            {state.status === "ok" && state.action === "info" && (
              <div className="panel-result panel-result--ok">
                <p className="panel-result-title">Webhook status</p>
                <dl className="panel-result-list">
                  {webhookInfoRows(state.data).map(([label, value]) => (
                    <div className="panel-result-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {state.status === "ok" && state.action !== "info" && (
              <div className="panel-result panel-result--ok">
                <p className="panel-result-title">
                  {labelFor(state.action)} succeeded
                </p>
                <p className="panel-result-body">
                  {describeSimpleResult(state.action, state.data)}
                </p>
              </div>
            )}
          </div>

          <div className="panel-actions">
            <button
              className="view-card-button"
              onClick={() => run("register")}
              disabled={busy}
            >
              {state.status === "loading" && state.action === "register"
                ? "Setting up…"
                : "Setup Webhook"}
            </button>
            <button
              className="view-card-button"
              onClick={() => run("delete")}
              disabled={busy}
            >
              {state.status === "loading" && state.action === "delete"
                ? "Deleting…"
                : "Delete webhook"}
            </button>
            <button
              className="view-card-button"
              onClick={() => run("info")}
              disabled={busy}
            >
              {state.status === "loading" && state.action === "info"
                ? "Checking…"
                : "Check webhook"}
            </button>
          </div>
        </div>
      </article>
    </main>
  );
}

function labelFor(action: Action): string {
  switch (action) {
    case "register":
      return "Setup webhook";
    case "delete":
      return "Delete webhook";
    case "info":
      return "Check webhook";
  }
}

function webhookInfoRows(data: unknown): Array<[string, string]> {
  const info =
    data && typeof data === "object" && "info" in data
      ? ((data as { info: Record<string, unknown> }).info ?? {})
      : {};
  return [
    ["URL", String(info.url ?? "(none)")],
    ["Pending updates", String(info.pending_update_count ?? 0)],
    [
      "Last error",
      info.last_error_message ? String(info.last_error_message) : "none",
    ],
    ["Custom certificate", info.has_custom_certificate ? "yes" : "no"],
  ];
}

function describeSimpleResult(action: Action, data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    return String((data as { message: unknown }).message);
  }
  if (data && typeof data === "object" && "url" in data) {
    const url = String((data as { url: unknown }).url);
    const enforced = (data as { secretEnforced?: unknown }).secretEnforced;
    return enforced
      ? `Webhook set to ${url} with secret enforced.`
      : `Webhook set to ${url} without a secret.`;
  }
  return action === "delete" ? "Webhook removed." : "Done.";
}
