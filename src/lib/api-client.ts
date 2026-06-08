/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason Typed API client with retry logic was intended as a replacement
 * for raw fetch calls but was never adopted. The codebase uses direct
 * fetch() calls in hooks and components instead.
 */

/**
 * API Client
 *
 * Typed API client with error handling and retry logic.
 * Auth is handled via httpOnly cookies — browser sends them automatically.
 *
 * Usage:
 *   const { data, error } = await api.get("/api/wiki");
 *   const { data } = await api.post("/api/wiki", { title: "Test" });
 */

interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  status: number;
}

interface ApiOptions {
  retries?: number;
  retryDelay?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Make an API request with error handling.
   * Browser automatically sends httpOnly cookies with same-origin requests.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: ApiOptions = {}
  ): Promise<ApiResponse<T>> {
    const { retries = 0, retryDelay = 1000 } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        let data: T | null = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          data = await res.json();
        }

        if (!res.ok) {
          const errorData = data as Record<string, unknown> | null;
          const errorMsg = typeof errorData?.error === 'string' ? errorData.error : `Request failed: ${res.status}`;
          throw new Error(errorMsg);
        }

        return { data, error: null, status: res.status };
      } catch (err: unknown) {
        lastError = err as Error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    return { data: null, error: lastError?.message || "Unknown error", status: 0 };
  }

  /**
   * GET request
   */
  async get<T = unknown>(path: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  /**
   * POST request
   */
  async post<T = unknown>(path: string, body?: unknown, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  /**
   * PUT request
   */
  async put<T = unknown>(path: string, body?: unknown, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(path: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }
}

// Singleton instance
export const api = new ApiClient();
