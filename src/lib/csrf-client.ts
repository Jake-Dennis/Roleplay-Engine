/**
 * CSRF Client Bridge
 *
 * Patches the global `window.fetch` on first import to automatically
 * attach the `X-CSRF-Token` header to every mutating request (POST, PUT, DELETE).
 *
 * This is a one-time bootstrap — import it once in the root client layout
 * and all fetch() calls in the app are protected.
 *
 * The CSRF token is read from the non-httpOnly `csrf-token` cookie set
 * by the login endpoint. If no cookie exists, no header is attached
 * (unauthenticated requests don't need CSRF protection).
 */

import { CsrfTokenHeader, CsrfCookieName } from "@/lib/csrf";

/** Read the CSRF token from the non-httpOnly cookie. */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CsrfCookieName}=([^;]*)`)
  );
  return match ? match[1] : null;
}

/**
 * Determine if a request method is mutating (needs CSRF protection).
 */
function isMutatingMethod(method: string): boolean {
  return ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase());
}

// Track whether we've already patched fetch to avoid double-patching
let patched = false;

// Store original fetch
let originalFetch: typeof window.fetch | null = null;

/**
 * Initialize CSRF protection by patching window.fetch.
 *
 * Call this once during app bootstrap (e.g., in a root layout's useEffect).
 * It is idempotent — safe to call multiple times.
 */
export function initCsrfClient(): void {
  if (patched) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return; // Server-side or no fetch available
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalFetch = window.fetch as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.fetch = function csrfFetch(this: any, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method || "GET").toUpperCase();

    // Only attach CSRF header to mutating requests
    if (isMutatingMethod(method)) {
      const token = getCsrfToken();
      if (token) {
        init = init || {};
        init.headers = init.headers || {};

        // Handle different header types
        if (init.headers instanceof Headers) {
          if (!init.headers.has(CsrfTokenHeader)) {
            init.headers.set(CsrfTokenHeader, token);
          }
        } else if (Array.isArray(init.headers)) {
          const hasHeader = (init.headers as [string, string][]).some(
            ([key]) => key.toLowerCase() === CsrfTokenHeader.toLowerCase()
          );
          if (!hasHeader) {
            (init.headers as [string, string][]).push([CsrfTokenHeader, token]);
          }
        } else {
          // Record<string, string>
          const headers = init.headers as Record<string, string>;
          if (!headers[CsrfTokenHeader]) {
            headers[CsrfTokenHeader] = token;
          }
        }
      }
    }

    return originalFetch!.call(window, input, init);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  patched = true;
}

// Auto-init on import (safe in module scope since it only patches once)
initCsrfClient();
