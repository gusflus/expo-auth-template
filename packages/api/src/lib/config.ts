/**
 * Get the API base URL from environment variables
 */
export function getApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = env.EXPO_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL environment variable is not set");
  }

  return baseUrl;
}

/**
 * Build full URL from base URL, endpoint, and optional query parameters
 */
export function buildUrl(
  baseUrl: string,
  endpoint: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(endpoint, baseUrl);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}
