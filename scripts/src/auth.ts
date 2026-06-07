import { FIREBASE_API_KEY } from "./config.js";

interface FirebaseSignInResponse {
  idToken?: string;
  refreshToken?: string;
  error?: { message: string };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = (await res.json()) as FirebaseSignInResponse;
  if (!res.ok || !data.idToken) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Firebase sign-in failed: ${msg}`);
  }
  return data.idToken;
}

export async function resolveIdToken(): Promise<string> {
  const direct = process.env.BOOKSHOP_ID_TOKEN?.trim();
  if (direct) return direct;

  const email = process.env.BOOKSHOP_EMAIL?.trim();
  const password = process.env.BOOKSHOP_PASSWORD;
  if (email && password) {
    return signInWithPassword(email, password);
  }

  throw new Error(
    "Set BOOKSHOP_ID_TOKEN, or BOOKSHOP_EMAIL + BOOKSHOP_PASSWORD",
  );
}
