import type {
  ApiErrorPayload,
  ApiSuccessPayload,
  SignInRequest,
} from "../types/api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function submitLead(
  body: SignInRequest,
): Promise<ApiSuccessPayload> {
  const payload = await postJson<Partial<ApiSuccessPayload>>(
    "/api/leads",
    body,
  );
  if (payload.ok !== true || typeof payload.message !== "string") {
    throw new ApiRequestError("The service returned an unexpected response.");
  }
  return payload as ApiSuccessPayload;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiRequestError(
      "Could not reach the service. Check your connection and try again.",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(
      "The service returned an unreadable response.",
      response.status,
    );
  }
  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    throw new ApiRequestError(
      errorPayload?.error?.message ??
        `The request failed (${response.status}).`,
      response.status,
    );
  }

  if (typeof payload !== "object" || payload === null) {
    throw new ApiRequestError("The service returned an unexpected response.");
  }
  return payload as T;
}
