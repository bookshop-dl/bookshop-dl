/** Values recovered from index.android.bundle (hermes-decomp, Bookshop app v2.0.1). */

export const API_BASE_URL = "https://bookshop.org";

/** Firebase Web API key from org.bookshop.app/res/values/strings.xml */
export const FIREBASE_API_KEY = "AIzaSyDFN0MbkYiqXue7-7oRnLFuta2klSb5YRU";

export const AUTH_HEADER = "bkshp-firebase-authorization";

export const ENDPOINTS = {
  digitalBooks: "/api/next/digitalbooks",
  licenseForEpub: (checksum: string, deviceRegistrationId: string) =>
    `/ebooks/m/contents/${checksum}/license?deviceRegistrationId=${encodeURIComponent(deviceRegistrationId)}`,
  userKeyForEpub: (checksum: string) => `/ebooks/m/contents/${checksum}/key`,
  epubByChecksum: (checksum: string) =>
    `/ebooks/${checksum}/resources/epub_mobile`,
  drmFreeEpubByChecksum: (checksum: string) =>
    `/ebooks/${checksum}/resources/direct_download`,
  devices: {
    register: "/ebooks/m/devices/register",
    validate: "/ebooks/m/devices/validateregistration",
    deregister: "/ebooks/m/devices/deregister",
    oldest: "/ebooks/m/devices/oldest",
  },
} as const;

export const DEFAULT_DEVICE_NAME = "Bookshop CLI (macOS)";
