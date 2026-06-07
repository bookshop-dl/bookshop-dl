export const BOOKSHOP_API = "https://bookshop.org";

const REQUEST_TIMEOUT_MS = 30_000;

// Impersonate the Android app (okhttp is React Native's default HTTP stack on Android).
const ANDROID_USER_AGENT = "okhttp/4.12.0";

export function mobileHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": ANDROID_USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
}

export async function bookshopFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", ANDROID_USER_AGENT);
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "en-US,en;q=0.9");
  }

  return fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}
