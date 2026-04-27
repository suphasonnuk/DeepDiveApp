import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required. Generate one with: openssl rand -hex 32");
  }
  return new TextEncoder().encode(secret);
}
const SESSION_DURATION = "1h";

const MAX_PASSPHRASE_LENGTH = 256;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { passphrase } = body as { passphrase?: unknown };

  if (!passphrase || typeof passphrase !== "string" || passphrase.length > MAX_PASSPHRASE_LENGTH) {
    return NextResponse.json({ error: "Passphrase required" }, { status: 400 });
  }

  const token = await new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getJwtSecret());

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60,
    path: "/",
  });

  return response;
}
