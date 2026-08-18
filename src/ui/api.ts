import type { OrganizedDraft } from "../core/organizer.js";
import type { CreateEntryInput, Entry, SearchFilters, Summary } from "../core/types.js";

export async function getSummary(): Promise<Summary> {
  return request("/api/summary");
}

export async function createEntry(input: CreateEntryInput): Promise<Entry> {
  return request("/api/entries", { method: "POST", body: input });
}

export async function updateEntry(id: string, updates: Partial<CreateEntryInput>): Promise<Entry> {
  return request(`/api/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: updates });
}

export async function deleteEntry(id: string): Promise<void> {
  await request(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function organizeCapture(body: string): Promise<OrganizedDraft> {
  return request("/api/organize", { method: "POST", body: { body } });
}

export async function searchEntries(filters: SearchFilters): Promise<Entry[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, String(value));
    }
  }
  return request(`/api/search?${params.toString()}`);
}

export function subscribeToChanges(onChange: () => void): () => void {
  const url = `${location.origin.replace(/^http/, "ws")}/api/sync`;
  let socket: WebSocket;
  let closedByUs = false;
  let backoff = 1000;

  function connect() {
    socket = new WebSocket(url);
    socket.onmessage = () => onChange();
    socket.onclose = () => {
      if (closedByUs) {
        return;
      }
      setTimeout(connect, Math.min(backoff, 15000));
      backoff *= 2;
    };
  }

  connect();
  return () => {
    closedByUs = true;
    socket.close();
  };
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (text && !isJsonResponse(response, text)) {
    throw new Error(`Expected JSON from ${path} but received ${response.headers.get("Content-Type") ?? "a non-JSON response"}.`);
  }
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = isErrorPayload(payload)
      ? payload.error
      : `Request failed with status ${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }
  return payload as T;
}

function isErrorPayload(value: unknown): value is { error: string } {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && typeof (value as { error: unknown }).error === "string";
}

function isJsonResponse(response: Response, text: string): boolean {
  const contentType = response.headers.get("Content-Type") ?? "";
  return contentType.includes("application/json") || /^[\[{]/.test(text.trimStart());
}
