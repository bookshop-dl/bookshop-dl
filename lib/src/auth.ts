export interface Credentials {
  email: string;
  password: string;
}

const FIREBASE_API_KEY = "AIzaSyDFN0MbkYiqXue7-7oRnLFuta2klSb5YRU";

let session: Credentials | null = null;

export function setCredentials(credentials: Credentials) {
  session = credentials;
}

export function clearCredentials() {
  session = null;
}

export async function getToken(): Promise<string> {
  const email = session?.email ?? process.env.BOOKSHOP_EMAIL?.trim();
  const password = session?.password ?? process.env.BOOKSHOP_PASSWORD;
  if (!email || !password) {
    throw new Error("Bookshop email and password are required");
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
      `Sign-in failed: ${data.error?.message ?? res.status}`,
    );
  }
  return data.idToken;
}
