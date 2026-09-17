import "server-only";

import { cookies } from "next/headers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { AppError } from "@/lib/domain";

export const SESSION_COOKIE_NAME = "austin_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
const DUMMY_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const DUMMY_ITERATIONS = 150_000;

export type AuthenticatedIdentity = {
  accountId: string | null;
  userId: string;
  displayName: string;
  email: string;
};

type CredentialRow = {
  accountId: string;
  authUserId: string;
  displayName: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  iterations: number;
  failedAttempts: number;
  lockedUntil: string | null;
};

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function derivePasswordHash(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64(saltBase64),
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function identityFromSessionToken(
  token: string | undefined,
): Promise<AuthenticatedIdentity | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await sha256(token);
  const account = await getD1()
    .prepare(
      `SELECT account_record.id AS accountId,
              account_record.auth_user_id AS userId,
              account_record.display_name AS displayName,
              account_record.email
       FROM account_sessions session_record
       JOIN user_accounts account_record ON account_record.id=session_record.account_id
       JOIN organizations organization ON organization.id=account_record.organization_id
       WHERE session_record.token_hash=?
         AND session_record.revoked_at IS NULL
         AND datetime(session_record.expires_at)>datetime('now')
         AND account_record.status='active'
         AND organization.status='active'
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<AuthenticatedIdentity>();
  return account ?? null;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const cookieStore = await cookies();
  const localIdentity = await identityFromSessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (localIdentity) return localIdentity;

  const hostedIdentity = await getChatGPTUser();
  if (!hostedIdentity) return null;
  return {
    accountId: null,
    userId: hostedIdentity.userId,
    displayName: hostedIdentity.displayName,
    email: hostedIdentity.email,
  };
}

export async function createCredentialSession(
  email: string,
  password: string,
): Promise<{ token: string; accountId: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await getD1()
    .prepare(
      `SELECT account_record.id AS accountId,
              account_record.auth_user_id AS authUserId,
              account_record.display_name AS displayName,
              account_record.email,
              credential.password_salt AS passwordSalt,
              credential.password_hash AS passwordHash,
              credential.iterations,
              credential.failed_attempts AS failedAttempts,
              credential.locked_until AS lockedUntil
       FROM user_accounts account_record
       JOIN account_credentials credential ON credential.account_id=account_record.id
       JOIN organizations organization ON organization.id=account_record.organization_id
       WHERE lower(account_record.email)=?
         AND account_record.status='active'
         AND organization.status='active'
       LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<CredentialRow>();

  const derived = await derivePasswordHash(
    password,
    credential?.passwordSalt ?? DUMMY_SALT,
    Number(credential?.iterations ?? DUMMY_ITERATIONS),
  );
  const expected = fromBase64(credential?.passwordHash ?? DUMMY_HASH);
  const valid = Boolean(credential) && constantTimeEqual(derived, expected);
  const locked = Boolean(
    credential?.lockedUntil &&
      new Date(`${credential.lockedUntil.replace(" ", "T")}Z`).getTime() > Date.now(),
  );

  if (!valid || locked || !credential) {
    if (credential) {
      await getD1()
        .prepare(
          `UPDATE account_credentials
           SET failed_attempts=MIN(failed_attempts+1,20),
               locked_until=CASE
                 WHEN locked_until IS NOT NULL AND datetime(locked_until)>datetime('now')
                   THEN locked_until
                 WHEN failed_attempts+1>=5 THEN datetime('now','+15 minutes')
                 ELSE locked_until END
           WHERE account_id=?`,
        )
        .bind(credential.accountId)
        .run();
    }
    throw new AppError(401, "LOGIN_FAILED", "邮箱或密码错误。");
  }

  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = toBase64Url(random);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await getD1().batch([
    getD1()
      .prepare(
        `UPDATE account_credentials
         SET failed_attempts=0,locked_until=NULL
         WHERE account_id=?`,
      )
      .bind(credential.accountId),
    getD1()
      .prepare(
        `DELETE FROM account_sessions
         WHERE account_id=? AND (revoked_at IS NOT NULL OR datetime(expires_at)<=datetime('now'))`,
      )
      .bind(credential.accountId),
    getD1()
      .prepare(
        `INSERT INTO account_sessions
          (token_hash,account_id,expires_at)
         VALUES (?,?,?)`,
      )
      .bind(tokenHash, credential.accountId, expiresAt),
  ]);
  return { token, accountId: credential.accountId };
}

export async function revokeSessionToken(token: string | undefined): Promise<void> {
  if (!token || !TOKEN_PATTERN.test(token)) return;
  const tokenHash = await sha256(token);
  await getD1()
    .prepare(
      `UPDATE account_sessions
       SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP)
       WHERE token_hash=?`,
    )
    .bind(tokenHash)
    .run();
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function readCookieHeader(header: string | null, name: string): string | undefined {
  return (header ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
