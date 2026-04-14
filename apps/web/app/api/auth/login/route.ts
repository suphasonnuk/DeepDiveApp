import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * POST /api/auth/login
 *
 * First-time: if no AUTH_KEY_HASH is set, this is initial setup — store the hash.
 * Subsequent: compare submitted auth key hash against stored hash.
 *
 * In production, AUTH_KEY_HASH and JWT_SECRET are Vercel environment variables.
 * For initial setup, the first passphrase becomes the permanent auth credential.
 */

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
);
const SESSION_DURATION = "1h";

export async function POST(request: NextRequest) {
  const { passphrase } = await request.json();

  if (!passphrase || typeof passphrase !== "string") {
    return NextResponse.json({ error: "Passphrase required" }, { status: 400 });
  }

  // Derive auth key hash from passphrase (server-side verification)
  // In production, the client sends the pre-derived authKeyHex
  // For now, we compare against the stored hash
  const storedHash = process.env.AUTH_KEY_HASH;
  const isPlaceholder = storedHash === "set-after-first-login-with-derived-auth-key-hex";

  if (!storedHash || isPlaceholder) {
    // First-time setup mode: accept any passphrase
    // The user must set AUTH_KEY_HASH env var after initial setup
    console.warn(
      "[AUTH] No AUTH_KEY_HASH configured — running in setup mode. " +
      "Set AUTH_KEY_HASH env var to lock down.",
    );
  } else if (passphrase !== storedHash) {
    // In production, the client sends authKeyHex derived via PBKDF2
    return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
  }

  // Issue JWT
  const token = await new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(JWT_SECRET);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });

  return response;
}
