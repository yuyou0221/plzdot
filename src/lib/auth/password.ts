import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const keyLength = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, keyLength).toString("base64url");

  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) {
    return false;
  }

  const [algorithm, salt, key] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const expectedKey = Buffer.from(key, "base64url");
  const actualKey = scryptSync(password, salt, expectedKey.length);

  return expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}

export function isValidPassword(password: string) {
  return password.length >= 8;
}
