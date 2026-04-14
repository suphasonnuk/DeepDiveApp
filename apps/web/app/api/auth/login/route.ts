import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * POST /api/auth/login
 *
 * Single-user app: any non-empty passphrase grants a session.
 * The passphrase is used CLIENT-SIDE to derive an AES-256-GCM encryption
 * key (via PBKDF2) that protects sensitive data in IndexedDB.
 * Server-side, we just issue a JWT to gate API access.
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

  // Issue JWT session token
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
