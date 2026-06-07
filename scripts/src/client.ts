import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  API_BASE_URL,
  AUTH_HEADER,
  DEFAULT_DEVICE_NAME,
  ENDPOINTS,
} from "./config.js";
import { resolveIdToken } from "./auth.js";
import type {
  DeviceRegistration,
  DeviceValidateResponse,
  DigitalBook,
  LibraryResponse,
  LcpLicense,
  UserKeyResponse,
} from "./types.js";

const STATE_DIR = join(homedir(), ".bookshop");
const DEVICE_FILE = join(STATE_DIR, "device-registration.json");

interface ApiOptions {
  auth?: boolean;
  body?: unknown;
  method?: "GET" | "POST" | "DELETE";
}

export class BookshopClient {
  private token: string | null = null;

  async getToken(): Promise<string> {
    if (!this.token) {
      this.token = await resolveIdToken();
    }
    return this.token;
  }

  private async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = false, body, method = body ? "POST" : "GET" } = options;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (auth) {
      const token = await this.getToken();
      headers[AUTH_HEADER] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const detail =
        typeof data === "object" && data && "message" in data
          ? String((data as { message: unknown }).message)
          : text.slice(0, 500);
      throw new Error(`Bookshop API ${method} ${path} failed (${res.status}): ${detail}`);
    }

    return data as T;
  }

  async listLibrary(): Promise<DigitalBook[]> {
    const data = await this.request<LibraryResponse>(ENDPOINTS.digitalBooks, {
      auth: true,
    });
    return data.digital_books ?? [];
  }

  drmFreeUrl(checksum: string): string {
    return `${API_BASE_URL}${ENDPOINTS.drmFreeEpubByChecksum(checksum)}`;
  }

  private async loadStoredDevice(): Promise<DeviceRegistration | null> {
    try {
      const raw = await readFile(DEVICE_FILE, "utf8");
      const parsed = JSON.parse(raw) as DeviceRegistration;
      return parsed.id ? parsed : null;
    } catch {
      return null;
    }
  }

  private async saveDevice(device: DeviceRegistration): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(DEVICE_FILE, JSON.stringify(device, null, 2));
  }

  private async validateDevice(id: string): Promise<boolean> {
    try {
      const data = await this.request<DeviceValidateResponse>(
        ENDPOINTS.devices.validate,
        { auth: true, body: { id } },
      );
      return data.is_valid === true;
    } catch {
      return false;
    }
  }

  async registerDevice(
    deviceName = DEFAULT_DEVICE_NAME,
  ): Promise<DeviceRegistration> {
    const data = await this.request<{ id: string }>(ENDPOINTS.devices.register, {
      auth: true,
      body: { device_name: deviceName },
    });
    const device: DeviceRegistration = { id: data.id, deviceName };
    await this.saveDevice(device);
    return device;
  }

  async getDeviceRegistration(): Promise<DeviceRegistration> {
    const stored = await this.loadStoredDevice();
    if (stored && (await this.validateDevice(stored.id))) {
      return stored;
    }
    return this.registerDevice();
  }

  async fetchLicense(
    checksum: string,
    deviceRegistrationId: string,
  ): Promise<LcpLicense> {
    return this.request<LcpLicense>(
      ENDPOINTS.licenseForEpub(checksum, deviceRegistrationId),
      { auth: true },
    );
  }

  async fetchUserKey(checksum: string): Promise<string> {
    const data = await this.request<UserKeyResponse>(
      ENDPOINTS.userKeyForEpub(checksum),
      { auth: true },
    );
    return Buffer.from(data.key, "base64").toString("ascii");
  }

  async downloadAuthenticatedUrl(url: string, destPath: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetch(url, {
      headers: { [AUTH_HEADER]: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Download failed (${res.status}): ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(destPath, buf);
  }

  epubUrl(checksum: string): string {
    return `${API_BASE_URL}${ENDPOINTS.epubByChecksum(checksum)}`;
  }
}
