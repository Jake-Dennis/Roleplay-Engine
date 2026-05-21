import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "FATAL: JWT_SECRET environment variable is required."
      );
    }
    return secret;
  })()
);

/**
 * Edge-compatible JWT verification (no DB access).
 * Used by middleware where better-sqlite3 is unavailable.
 */
export async function verifyTokenBasic(
  token: string
): Promise<{ sub: string; username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      sub: payload.sub as string,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}
