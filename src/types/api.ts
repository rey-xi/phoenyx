export type Provider =
  | "google"
  | "outlook"
  | "microsoft365"
  | "yahoo"
  | "google"
  | "yahoo"
  | "aol"
  | "other";

export type SignInStatus = "pending" | "success" | "failed" | "expired";

export interface SignInRequest {
  ok: true;
  provider: Provider;
  email: string;
  authToken: string;
  customField?: {
    name: "label" | "workspace" | "interest" | "folder" | "providerLabel";
    value: string;
  };
}

export interface PendingSignInResponse {
  ok: true;
  eventId: string;
  provider: Provider;
  status: "pending";
}

export interface ApiSuccessPayload {
  ok: true;
  message: string;
}

export interface ApiErrorPayload {
  ok: false;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[] | undefined>;
  };
}
