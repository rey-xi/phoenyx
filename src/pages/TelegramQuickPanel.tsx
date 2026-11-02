import { useState } from "react";
import "../styles/telegramQuickPanel.css";

type Query = "register" | "delete" | "info";

type PanelState =
  | { status: "idle" }
  | { status: "loading"; query: Query }
  | { status: "ok"; query: Query; data: unknown }
  | { status: "error"; query: Query; message: string };

async function runQuery(query: Query) {
  const res = await fetch(`/api/telegram/webhook/${query}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("That passcode is not valid. Check it and try again.");
    }
    const error =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : null;
    const message =
      (typeof error === "string" ? error : null) ??
      (error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : null) ??
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function TelegramQuickPanel() {
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const busy = state.status === "loading";

  async function runStatefulQuery(query: Query) {
    setState({ status: "loading", query });
    try {
      const data = await runQuery(query);
      setState({ status: "ok", query, data });
    } catch (err) {
      setState({
        status: "error",
        query,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <main className="telegram-panel-shell telegram-panel-shell--card">
      <div className="telegram-panel-light" aria-hidden="true" />
      <article className="telegram-panel-card" aria-labelledby="card-title">
        <span
          className="telegram-panel-corner telegram-panel-corner-top"
          aria-hidden="true"
        />
        <span
          className="telegram-panel-corner telegram-panel-corner-bottom"
          aria-hidden="true"
        />
        <div className="telegram-panel-content">
          <p className="telegram-panel-kicker">Telegram Quick Panel</p>
          <span className="telegram-panel-star" aria-hidden="true">
            ✳
          </span>
          <div className="telegram-panel-result-slot">
            {state.status === "idle" && (
              <p className="telegram-panel-hint">
                Manage your bot&apos;s webhook from here.
              </p>
            )}
            {state.status === "loading" && (
              <p className="telegram-panel-hint telegram-panel-hint--loading">
                {labelFor(state.query)}…
              </p>
            )}
            {state.status === "error" && (
              <div
                className="telegram-panel-result telegram-panel-result--error"
                role="alert"
              >
                <p className="telegram-panel-result-title">
                  {labelFor(state.query)} failed
                </p>
                <p className="telegram-panel-result-body">{state.message}</p>
              </div>
            )}
            {state.status === "ok" && state.query === "info" && (
              <div className="telegram-panel-result telegram-panel-result--ok">
                <p className="telegram-panel-result-title">Webhook status</p>
                <dl className="telegram-panel-result-list">
                  {webhookInfoRows(state.data).map(([label, value]) => (
                    <div className="telegram-panel-result-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {state.status === "ok" && state.query !== "info" && (
              <div className="telegram-panel-result telegram-panel-result--ok">
                <p className="telegram-panel-result-title">
                  {labelFor(state.query)} succeeded
                </p>
                <p className="telegram-panel-result-body">
                  {describeSimpleResult(state.query, state.data)}
                </p>
              </div>
            )}
          </div>
          <div className="telegram-panel-actions">
            <button
              className="telegram-panel-action"
              disabled={busy}
              onClick={() => void runStatefulQuery("register")}
            >
              {state.status === "loading" && state.query === "register"
                ? "Setting up…"
                : "Setup Webhook"}
            </button>
            <button
              className="telegram-panel-action"
              disabled={busy}
              onClick={() => void runStatefulQuery("delete")}
            >
              {state.status === "loading" && state.query === "delete"
                ? "Deleting…"
                : "Delete webhook"}
            </button>
            <button
              className="telegram-panel-action"
              disabled={busy}
              onClick={() => void runStatefulQuery("info")}
            >
              {state.status === "loading" && state.query === "info"
                ? "Checking…"
                : "Check webhook"}
            </button>
          </div>
        </div>
      </article>
    </main>
  );
}

function labelFor(query: Query): string {
  switch (query) {
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

function describeSimpleResult(query: Query, data: unknown): string {
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
  return query === "delete" ? "Webhook removed." : "Done.";
}
