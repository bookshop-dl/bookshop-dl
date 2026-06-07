import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(scriptsDir, ".env"), quiet: true });

const FIREBASE_API_KEY = "AIzaSyDFN0MbkYiqXue7-7oRnLFuta2klSb5YRU";

export async function getToken(): Promise<string> {
  const email = process.env.BOOKSHOP_EMAIL?.trim();
  const password = process.env.BOOKSHOP_PASSWORD;
  if (!email || !password) {
    throw new Error("Set BOOKSHOP_EMAIL and BOOKSHOP_PASSWORD in .env");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const data = (await res.json()) as {
    idToken?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.idToken) {
    throw new Error(
      `Firebase sign-in failed: ${data.error?.message ?? res.status}`,
    );
  }
  return data.idToken;
}
