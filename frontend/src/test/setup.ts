import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";

// Node 22+ ships its own experimental global `localStorage`/`sessionStorage`, which is
// inert without a `--localstorage-file` flag. Vitest's jsdom environment only forwards a
// window property onto globalThis when the name is either absent from globalThis or on
// its known-keys allowlist; since Node's own (non-functional) `localStorage` already
// exists as a global and predates that allowlist, jsdom's real, working Storage never
// gets copied over. Point the globals at jsdom's implementation directly.
{
  const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom
    ?.window;
  if (jsdomWindow) {
    Object.defineProperty(globalThis, "localStorage", {
      get: () => jsdomWindow.localStorage,
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      get: () => jsdomWindow.sessionStorage,
      configurable: true,
    });
  }
}

// jsdom 25 does not ship PointerEvent. Polyfill it so that
// @testing-library/dom can create proper pointer events with clientX/pointerId.
if (typeof window !== "undefined" && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    width: number;
    height: number;
    pressure: number;
    tangentialPressure: number;
    tiltX: number;
    tiltY: number;
    twist: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
    }
    getCoalescedEvents() { return []; }
    getPredictedEvents() { return []; }
  }
  Object.defineProperty(window, "PointerEvent", {
    value: PointerEventPolyfill,
    writable: true,
    configurable: true,
  });
}
import { server } from "./server";

// jsdom does not implement URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}

// Patch Request.prototype.formData to work in jsdom test environment.
// Node 26's undici fails a webidl.is.File assertion because jsdom replaced globalThis.File.
// Our parser returns jsdom-native FormData/File objects which tests can work with.
{
  const origFormData = Request.prototype.formData;
  Request.prototype.formData = async function patchedRequestFormData(
    this: Request,
  ): Promise<FormData> {
    const ct = this.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return origFormData.call(this);
    }
    const boundaryMatch = ct.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return origFormData.call(this);
    const boundary = boundaryMatch[1];

    const buf = await this.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const dec = new TextDecoder("utf-8", { fatal: false });
    const text = dec.decode(bytes);

    const result = new FormData();
    const delimiter = `--${boundary}`;
    const parts = text.split(delimiter).slice(1); // skip preamble

    for (const part of parts) {
      if (part.startsWith("--") || part.trim() === "") continue;
      const crlfCrlf = part.indexOf("\r\n\r\n");
      if (crlfCrlf === -1) continue;
      const headerSection = part.slice(2, crlfCrlf); // skip leading \r\n
      const bodySection = part.slice(crlfCrlf + 4, part.endsWith("\r\n") ? -2 : undefined);

      // Use non-greedy match to get the first `name=` param (not `filename=`)
      const dispMatch = headerSection.match(/Content-Disposition:[^\r\n]*?;\s*name="([^"]+)"/);
      if (!dispMatch) continue;
      const fieldName = dispMatch[1];

      const filenameMatch = headerSection.match(/filename="([^"]+)"/);
      const contentTypeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/);

      if (filenameMatch) {
        const filename = filenameMatch[1];
        const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : "application/octet-stream";
        // Encode body back to bytes for File
        const enc = new TextEncoder();
        const fileBytes = enc.encode(bodySection);
        const file = new File([fileBytes], filename, { type: mimeType });
        result.append(fieldName, file);
      } else {
        result.append(fieldName, bodySection);
      }
    }
    return result;
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  // jsdom's FormData does not produce multipart/form-data when used as a fetch body.
  // Wrap fetch (after MSW has patched it) to serialize FormData bodies properly so
  // MSW handlers can call request.formData() successfully.
  const mswFetch = globalThis.fetch;
  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (init?.body instanceof FormData) {
      const boundary = `----formdata-boundary-${Math.random().toString(36).slice(2)}`;
      const parts: Uint8Array[] = [];
      const enc = new TextEncoder();

      const entries: Array<[string, FormDataEntryValue]> = [];
      (init.body as FormData).forEach((value, name) => entries.push([name, value]));

      for (const [name, value] of entries) {
        if (value instanceof File) {
          // jsdom's File doesn't have arrayBuffer(); use FileReader to get bytes
          const fileBytes = await new Promise<Uint8Array>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(value as File);
          });
          const header = enc.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${(value as File).name}"\r\nContent-Type: ${(value as File).type || "application/octet-stream"}\r\n\r\n`,
          );
          const trailer = enc.encode("\r\n");
          const part = new Uint8Array(header.length + fileBytes.length + trailer.length);
          part.set(header, 0);
          part.set(fileBytes, header.length);
          part.set(trailer, header.length + fileBytes.length);
          parts.push(part);
        } else {
          parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        }
      }
      const closing = enc.encode(`--${boundary}--\r\n`);

      const totalLength = parts.reduce((n, p) => n + p.length, 0) + closing.length;
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const part of parts) { body.set(part, offset); offset += part.length; }
      body.set(closing, offset);

      return mswFetch(input, {
        ...init,
        body,
        headers: {
          ...(init.headers ?? {}),
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
      });
    }
    return mswFetch(input, init);
  } as typeof fetch;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
