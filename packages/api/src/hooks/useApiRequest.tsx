import {
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useAuth } from "auth";
import { makeRequest } from "../lib/client";
import { ApiRequestConfig, ApiResponse } from "../types";

/**
 * Hook for making authenticated/unauthenticated API requests
 *
 * @template TData - Type of the response data
 * @template TBody - Type of the request body (for mutations)
 *
 * @param config - Request configuration including method, endpoint, query params, body
 * @param options - Optional TanStack Query options to customize behavior
 *
 * @returns UseQueryResult with typed data or useMutation result for mutations
 *
 * @example
 * // GET request
 * const { data, isLoading } = useApiRequest<User>({
 *   method: "GET",
 *   endpoint: "/users/123",
 * });
 *
 * @example
 * // POST mutation
 * const mutation = useApiRequest<User, CreateUserBody>({
 *   method: "POST",
 *   endpoint: "/users",
 * });
 * mutation.mutate({ name: "John" });
 */

export function useApiRequest<TData, TBody = unknown>(
  config: ApiRequestConfig<TData, TBody>,
  options?:
    | Omit<
        UseQueryOptions<ApiResponse<TData>>,
        "queryKey" | "queryFn" | "enabled"
      >
    | Omit<
        UseMutationOptions<ApiResponse<TData>, Error, TBody | undefined>,
        "mutationFn"
      >,
) {
  const auth = useAuth();

  // Determine if this is a mutation (non-GET request)
  const isMutation = config.method !== "GET";

  if (isMutation) {
    // Return mutation hook for POST, PUT, PATCH, DELETE
    return useMutation({
      mutationFn: async (body?: TBody) =>
        makeRequest<ApiResponse<TData>>({
          method: config.method as Exclude<typeof config.method, "GET">,
          endpoint: config.endpoint,
          query: config.query,
          body: body || config.body,
          token: auth.sub ? await getAuthToken() : undefined,
        }),
      ...(options as Omit<
        UseMutationOptions<ApiResponse<TData>, Error, TBody | undefined>,
        "mutationFn"
      >),
    });
  }

  // Return query hook for GET requests
  return useQuery<ApiResponse<TData>>({
    queryKey: [config.method, config.endpoint, config.query],
    queryFn: async () =>
      makeRequest<ApiResponse<TData>>({
        method: "GET",
        endpoint: config.endpoint,
        query: config.query,
        token: auth.sub
          ? await getAuthToken().catch(() => undefined)
          : undefined,
      }),
    enabled: config.enabled !== false,
    ...(options as Omit<
      UseQueryOptions<ApiResponse<TData>>,
      "queryKey" | "queryFn" | "enabled"
    >),
  });
}

/**
 * Helper to get the current auth token from Amplify
 * Use ACCESS token for API authorization, not ID token
 */
async function getAuthToken(): Promise<string | undefined> {
  try {
    // Use the lower-level API to get the raw JWT
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession();

    // In Amplify v6, the raw tokens are in session.tokens but wrapped in DecodedToken objects
    // We need to access the JWT from the session credentials directly
    const credentials = await (async () => {
      try {
        const { getCurrentUser } = await import("aws-amplify/auth");
        await getCurrentUser();
        return true;
      } catch {
        return false;
      }
    })();

    if (!credentials) {
      console.warn("User not authenticated");
      return undefined;
    }

    // Try to get the access token - it should be the JWT string or an object with the JWT
    const accessToken = session.tokens?.accessToken;

    if (!accessToken) {
      console.warn("No access token in session");
      return undefined;
    }

    // The accessToken object should have a toString method that returns the JWT
    // But Amplify's DecodedToken.toString() returns a hash, not the JWT
    // The JWT should be accessible via the token's internal structure

    // Check for private fields or try JSON serialization with a custom replacer
    let foundToken: string | undefined;

    // Try various properties that might contain the raw JWT
    const properties = ["token", "jwt", "value", "raw", "_token", "jwtToken"];
    for (const prop of properties) {
      if (prop in accessToken) {
        const val = (accessToken as any)[prop];
        if (typeof val === "string" && val.includes(".")) {
          foundToken = val;
          break;
        }
      }
    }

    if (foundToken) {
      return foundToken;
    }

    // If the token object is itself serializable to a string representation
    // Try using JSON.stringify and see if we can extract the JWT
    try {
      const serialized = JSON.stringify(accessToken, null, 2);
      console.log("Access token JSON:", serialized);
    } catch (e) {
      console.log("Could not stringify token");
    }

    return undefined;
  } catch (error) {
    console.error("Error getting auth token:", error);
    return undefined;
  }
}

/**
 * Higher-level hook factory for creating typed API endpoints
 * Use this to create domain-specific hooks with pre-configured endpoints
 *
 * @example
 * export const useGetUser = (userId: string) =>
 *   createApiHook<User>({
 *     method: "GET",
 *     endpoint: `/users/${userId}`,
 *   });
 */
export function createApiHook<TData, TBody = unknown>(
  config: ApiRequestConfig<TData, TBody>,
  options?: UseQueryOptions<ApiResponse<TData>>,
) {
  return () => useApiRequest<TData, TBody>(config, options);
}
