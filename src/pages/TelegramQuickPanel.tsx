import { useState } from "react";
import "../styles/telegramQuickPanel.css";

type Query = "register" | "delete" | "info";

type PanelState =
  | { status: "idle" }
  | { status: "loading"; query: Query }
  | { status: "ok"; query: Query; data: unknown }
  | { status: "error"; query: Query; message: string };

const PASSCODE_PATTERN = /^[A-Za-z0-9]{4,64}$/;

async function runQuery(query: Query, passcode: string) {
  const res = await fetch(`/api/telegram/webhook/${query}`, {
    cache: "no-store",
    headers: {
      // Sent as a header so the passcode never appears in URLs, history, or
      // proxy access logs.
      "X-Quick-Panel-Passcode": passcode,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("That passcode is not valid. Check it and try again.");
    }
    const error = data && typeof data === "object" ? (data as { error?: unknown }).error : null;
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
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const busy = state.status === "loading";
  const passcodeReady = PASSCODE_PATTERN.test(passcode);

  async function runStatefulQuery(query: Query) {
    if (!passcodeReady) {
      setState({
        status: "error",
        query,
        message: "Enter your alphanumeric panel passcode first.",
      });
      return;
    }
    setState({ status: "loading", query });
    try {
      const data = await runQuery(query, passcode);
      setState({ status: "ok", query, data });
    } catch (err) {
      setState({
        status: "error",
        query,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handlePasscodeChange(value: string) {
    setPasscode(value.replace(/[^A-Za-z0-9]/g, "").slice(0, 64));
    if (state.status === "error") setState({ status: "idle" });
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
          <div className="telegram-panel-auth">
            <label
              className="telegram-panel-auth-label"
              htmlFor="quick-panel-passcode"
            >
              Panel passcode
            </label>
            <div className="telegram-panel-passcode">
              <input
                aria-describedby="quick-panel-passcode-hint"
                autoCapitalize="none"
                autoComplete="off"
                id="quick-panel-passcode"
                inputMode="text"
                maxLength={64}
                onChange={(event) => handlePasscodeChange(event.target.value)}
                placeholder="Alphanumeric passcode"
                spellCheck={false}
                type={showPasscode ? "text" : "password"}
                value={passcode}
              />
              <button
                aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                className="telegram-panel-passcode-toggle"
                onClick={() => setShowPasscode((visible) => !visible)}
                type="button"
              >
                {showPasscode ? "Hide" : "Show"}
              </button>
            </div>
            <p
              className="telegram-panel-auth-hint"
              id="quick-panel-passcode-hint"
            >
              Required for every action and checked against{" "}
              <code>QUICK_PANEL_PASSCODE</code> on the server.
            </p>
          </div>
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
              disabled={busy || !passcodeReady}
              onClick={() => void runStatefulQuery("register")}
            >
              {state.status === "loading" && state.query === "register"
                ? "Setting up…"
                : "Setup Webhook"}
            </button>
            <button
              className="telegram-panel-action"
              disabled={busy || !passcodeReady}
              onClick={() => void runStatefulQuery("delete")}
            >
              {state.status === "loading" && state.query === "delete"
                ? "Deleting…"
                : "Delete webhook"}
            </button>
            <button
              className="telegram-panel-action"
              disabled={busy || !passcodeReady}
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
