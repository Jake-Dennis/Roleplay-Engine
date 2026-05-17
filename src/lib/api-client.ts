/**
 * API Client
 *
 * Typed API client with centralized auth header injection, error handling, and retry logic.
 * Replaces raw `fetch()` calls across all page files.
 *
 * Usage:
 *   const { data, error } = await api.get("/api/npcs");
 *   const { data } = await api.post("/api/npcs", { name: "Test" });
 */

interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  status: number;
}

interface ApiOptions {
  token?: string;
  retries?: number;
  retryDelay?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Make an API request with auth headers and error handling
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any,
    options: ApiOptions = {}
  ): Promise<ApiResponse<T>> {
    const { token, retries = 0, retryDelay = 1000 } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Cookie"] = `auth-token=${token}`;
    }

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
          const errorData = data as any;
          throw new Error(errorData?.error || `Request failed: ${res.status}`);
        }

        return { data, error: null, status: res.status };
      } catch (e) {
        lastError = e as Error;
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
  async get<T = any>(path: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  /**
   * POST request
   */
  async post<T = any>(path: string, body?: any, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  /**
   * PUT request
   */
  async put<T = any>(path: string, body?: any, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  /**
   * DELETE request
   */
  async delete<T = any>(path: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }
}

// Singleton instance
export const api = new ApiClient();
