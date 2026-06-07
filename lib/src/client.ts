import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { getToken } from "./auth.js";
import { generateMobileDeviceName } from "./device-name.js";
import { BOOKSHOP_API, bookshopFetch, mobileHeaders } from "./http.js";

const AUTH_HEADER = "bkshp-firebase-authorization";
const DEVICE_FILE = join(homedir(), ".bookshop", "device-registration.json");

interface StoredDevice {
  id: string;
  device_name?: string;
}

export interface DeviceInfo {
  id: string;
  device_name: string;
}

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

class BookshopApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class BookshopClient {
  private token: string | null = null;

  resetToken() {
    this.token = null;
  }

  private async authHeaders() {
    if (!this.token) this.token = await getToken();
    return { [AUTH_HEADER]: `Bearer ${this.token}` };
  }

  private async api<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
    retried = false,
  ): Promise<T> {
    const headers = mobileHeaders({ Accept: "application/json" });
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.json);
    }
    Object.assign(headers, await this.authHeaders());

    const res = await bookshopFetch(`${BOOKSHOP_API}${path}`, {
      ...init,
      headers,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (res.status === 401 && !retried) {
      this.token = null;
      return this.api(path, init, true);
    }

    if (!res.ok) {
      throw new BookshopApiError(
        res.status,
        data?.message ?? text.slice(0, 200),
      );
    }
    return data as T;
  }

  listLibrary() {
    return this.api<{ digital_books?: DigitalBook[] }>(
      "/api/next/digitalbooks",
    ).then((data) => data.digital_books ?? []);
  }

  drmFreeUrl(checksum: string) {
    return `${BOOKSHOP_API}/ebooks/${checksum}/resources/direct_download`;
  }

  epubMobileUrl(checksum: string) {
    return `${BOOKSHOP_API}/ebooks/${checksum}/resources/epub_mobile`;
  }

  private async loadStoredDevice(): Promise<StoredDevice | null> {
    try {
      return JSON.parse(await readFile(DEVICE_FILE, "utf8")) as StoredDevice;
    } catch {
      return null;
    }
  }

  private async clearStoredDevice() {
    await unlink(DEVICE_FILE).catch(() => {});
  }

  private async saveDevice(device: StoredDevice) {
    await mkdir(join(homedir(), ".bookshop"), { recursive: true });
    await writeFile(DEVICE_FILE, JSON.stringify(device, null, 2));
  }

  private async validateRegistration(
    id: string,
  ): Promise<"valid" | "invalid" | "unknown"> {
    try {
      const result = await this.api<{ is_valid: boolean }>(
        "/ebooks/m/devices/validateregistration",
        { method: "POST", json: { id } },
      );
      return result.is_valid ? "valid" : "invalid";
    } catch {
      return "unknown";
    }
  }

  private async registerDevice(deviceName: string): Promise<{ id: string }> {
    try {
      return await this.api<{ id: string }>("/ebooks/m/devices/register", {
        method: "POST",
        json: { device_name: deviceName },
      });
    } catch (err) {
      if (!(err instanceof BookshopApiError) || err.status !== 403) {
        throw err;
      }

      const oldest = await this.api<{ id: string }>(
        "/ebooks/m/devices/oldest",
      );
      await this.api("/ebooks/m/devices/deregister", {
        method: "POST",
        json: { id: oldest.id },
      });
      return await this.api<{ id: string }>("/ebooks/m/devices/register", {
        method: "POST",
        json: { device_name: deviceName },
      });
    }
  }

  private toDeviceInfo(stored: StoredDevice): DeviceInfo {
    return {
      id: stored.id,
      device_name: stored.device_name ?? "Unknown Device",
    };
  }

  async peekDevice(): Promise<DeviceInfo | null> {
    const stored = await this.loadStoredDevice();
    if (!stored?.id) return null;
    return this.toDeviceInfo(stored);
  }

  async getDevice() {
    const stored = await this.loadStoredDevice();

    if (stored?.id) {
      const status = await this.validateRegistration(stored.id);
      if (status === "valid") return stored;
      if (status === "unknown") return stored;
      await this.clearStoredDevice();
    }

    const deviceName = stored?.device_name ?? generateMobileDeviceName();
    const device = await this.registerDevice(deviceName);
    const registered: StoredDevice = { id: device.id, device_name: deviceName };
    await this.saveDevice(registered);
    return registered;
  }

  async reregisterDevice(): Promise<DeviceInfo> {
    const stored = await this.loadStoredDevice();
    const deviceName = stored?.device_name ?? generateMobileDeviceName();
    await this.clearStoredDevice();
    const device = await this.registerDevice(deviceName);
    const registered: StoredDevice = { id: device.id, device_name: deviceName };
    await this.saveDevice(registered);
    return this.toDeviceInfo(registered);
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
    const res = await bookshopFetch(url, {
      headers: await this.authHeaders(),
    });
    if (res.status === 401) {
      this.token = null;
      const retry = await bookshopFetch(url, {
        headers: await this.authHeaders(),
      });
      if (!retry.ok) {
        const detail = (await retry.text()).slice(0, 200);
        throw new Error(
          `Download failed (${retry.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      await writeFile(dest, Buffer.from(await retry.arrayBuffer()));
      return;
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(
        `Download failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
}
