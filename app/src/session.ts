import { app, safeStorage } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface StoredSession {
  email: string;
  password: string;
}

export function initSessionStorage() {
  app.setName("bookshop-dl");
}

function sessionPath() {
  return join(app.getPath("userData"), "session.json");
}

export function canPersistSession() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function hasSavedSession() {
  try {
    return existsSync(sessionPath());
  } catch {
    return false;
  }
}

export async function saveSession(email: string, password: string) {
  if (!canPersistSession()) return;

  const data: StoredSession = {
    email,
    password: safeStorage.encryptString(password).toString("base64"),
  };
  const path = sessionPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

export async function loadSession(): Promise<StoredSession | null> {
  if (!hasSavedSession()) return null;

  try {
    const data = JSON.parse(
      await readFile(sessionPath(), "utf8"),
    ) as StoredSession;
    if (!data.email || !data.password) return null;

    return {
      email: data.email,
      password: safeStorage.decryptString(Buffer.from(data.password, "base64")),
    };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await unlink(sessionPath()).catch(() => {});
}
