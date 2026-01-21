import { buildUrl, getApiBaseUrl } from "./config.js";

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  body?: any;
  query?: Record<string, string | number | boolean | undefined>;
  token?: string;
}

/**
 * Make an HTTP request to the API
 * Automatically includes authentication token if provided
 */
export async function makeRequest<T>(options: RequestOptions): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = buildUrl(baseUrl, options.endpoint, options.query);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    console.log("Token details:", {
      type: typeof options.token,
      value: options.token,
      length: options.token.length,
      hasEqualSign: options.token.includes("="),
      hasDots: (options.token.match(/\./g) || []).length,
      first50chars: options.token.substring(0, 50),
    });
    headers.Authorization = `Bearer ${options.token}`;
    console.log("Authorization header:", headers.Authorization);
  }

  const fetchOptions: RequestInit = {
    method: options.method,
    headers,
  };

  if (options.body && options.method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      statusText: response.statusText,
      error,
    };
  }

  const data = (await response.json()) as T;
  return data;
}
