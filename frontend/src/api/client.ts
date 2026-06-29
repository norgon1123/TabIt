export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const detail = (data && typeof data.detail === "string" && data.detail) || res.statusText;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string) => request<T>(path, { method: "POST" }),
  postJson: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) }),
  patchJson: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
