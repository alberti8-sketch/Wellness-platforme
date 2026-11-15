export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

let currentKey = "";
let currentToken = "";
export function setApiKey(key: string) {
  currentKey = key;
}
/** Session token of a signed-in account; when set it replaces the demo API key. */
export function setToken(token: string) {
  currentToken = token;
}
function authHeaders(headers: Headers) {
  if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
  else if (currentKey) headers.set("X-API-Key", currentKey);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  authHeaders(headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `API injoignable (${API_URL}). Le backend est-il démarré ?`);
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* non-JSON error */
    }
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message: unknown }).message)
          : `Erreur ${res.status}`;
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T; // no content (DELETE)
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};

/** Download a file from an authenticated endpoint (the API key travels in a header, not the URL). */
export async function download(path: string, fallbackName: string) {
  const headers = new Headers();
  authHeaders(headers);
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, `Téléchargement impossible (${res.status})`);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
