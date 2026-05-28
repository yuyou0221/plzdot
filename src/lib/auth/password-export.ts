import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const payloadPrefix = "aes-256-gcm:v1";

export function encryptExportablePassword(password: string | null | undefined) {
  if (!password) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, passwordExportKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    payloadPrefix,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptExportablePassword(payload: string | null | undefined) {
  if (!payload) {
    return "";
  }

  const [algorithmName, version, encodedIv, encodedAuthTag, encodedCiphertext] = payload.split(":");

  if (`${algorithmName}:${version}` !== payloadPrefix || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
    return "";
  }

  try {
    const decipher = createDecipheriv(algorithm, passwordExportKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    return "";
  }
}

function passwordExportKey() {
  return createHash("sha256").update(passwordExportSecret()).digest();
}

function passwordExportSecret() {
  const secret = process.env.PASSWORD_EXPORT_SECRET || process.env.AUTH_SECRET || process.env.DATABASE_URL;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("PASSWORD_EXPORT_SECRET, AUTH_SECRET, or DATABASE_URL is required for exportable passwords.");
  }

  return "local-dev-password-export-secret-change-before-production";
}
