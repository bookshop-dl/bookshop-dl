import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { getToken } from "./auth.js";

const API = "https://bookshop.org";
const AUTH_HEADER = "bkshp-firebase-authorization";
const DEVICE_FILE = join(homedir(), ".bookshop", "device-registration.json");

export interface DigitalBook {
  checksum: string;
  sku: string;
  product?: { title?: string; is_drm_free?: boolean };
}

export interface LcpLicense {
  id?: string;
  encryption?: {
    profile?: string;
    content_key?: { algorithm?: string; encrypted_value?: string };
    user_key?: { algorithm?: string; key_check?: string };
  };
  links?: Array<{ rel: string; href: string; title?: string; hash?: string }>;
}

export class BookshopClient {
  private token: string | null = null;

  private async authHeaders(): Promise<Record<string, string>> {
    if (!this.token) this.token = await getToken();
    return { [AUTH_HEADER]: `Bearer ${this.token}` };
  }

  private async api<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.json);
    }
    Object.assign(headers, await this.authHeaders());

    const res = await fetch(`${API}${path}`, { ...init, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new Error(
        `Bookshop API failed (${res.status}): ${data?.message ?? text.slice(0, 200)}`,
      );
    }
    return data as T;
  }

  listLibrary() {
    return this.api<{ digital_books?: DigitalBook[] }>("/api/next/digitalbooks").then(
      (data) => data.digital_books ?? [],
    );
  }

  drmFreeUrl(checksum: string) {
    return `${API}/ebooks/${checksum}/resources/direct_download`;
  }

  async getDevice() {
    try {
      const stored = JSON.parse(await readFile(DEVICE_FILE, "utf8")) as {
        id: string;
      };
      const valid = await this.api<{ is_valid: boolean }>(
        "/ebooks/m/devices/validateregistration",
        { method: "POST", json: { id: stored.id } },
      );
      if (valid.is_valid) return stored;
    } catch {
      // register below
    }

    const device = await this.api<{ id: string }>(
      "/ebooks/m/devices/register",
      { method: "POST", json: { device_name: "Bookshop CLI (macOS)" } },
    );
    await mkdir(join(homedir(), ".bookshop"), { recursive: true });
    await writeFile(DEVICE_FILE, JSON.stringify(device, null, 2));
    return device;
  }

  fetchLicense(checksum: string, deviceId: string) {
    return this.api<LcpLicense>(
      `/ebooks/m/contents/${checksum}/license?deviceRegistrationId=${encodeURIComponent(deviceId)}`,
    );
  }

  async fetchUserKey(checksum: string) {
    const data = await this.api<{ key: string }>(
      `/ebooks/m/contents/${checksum}/key`,
    );
    return Buffer.from(data.key, "base64").toString("ascii");
  }

  async download(url: string, dest: string) {
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
}
