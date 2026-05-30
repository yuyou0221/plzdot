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

export function assertPasswordExportSecretConfigured() {
  passwordExportSecret();
}

export function getPasswordExportSecretStatus() {
  const protectedEnvironment = isProtectedEnvironment();

  if (process.env.PASSWORD_EXPORT_SECRET) {
    return {
      configured: true,
      protectedEnvironment,
      sourceLabel: "PASSWORD_EXPORT_SECRET",
      blocksProtectedOperations: false,
      message: "密码导出密钥已配置，导入、导出和改密码可以保存可导出密码记录。",
    };
  }

  if (protectedEnvironment) {
    return {
      configured: false,
      protectedEnvironment,
      sourceLabel: "未配置",
      blocksProtectedOperations: true,
      message: "正式环境缺少 PASSWORD_EXPORT_SECRET，导入、导出和改密码会被拒绝，避免生成未来无法解密的密码记录。",
    };
  }

  return {
    configured: true,
    protectedEnvironment,
    sourceLabel: "本地开发临时密钥",
    blocksProtectedOperations: false,
    message: "当前为本地开发环境，系统使用临时密钥方便测试；上线前必须配置 PASSWORD_EXPORT_SECRET。",
  };
}

function passwordExportKey() {
  return createHash("sha256").update(passwordExportSecret()).digest();
}

function passwordExportSecret() {
  const stableSecret = process.env.PASSWORD_EXPORT_SECRET;

  if (stableSecret) {
    return stableSecret;
  }

  if (isProtectedEnvironment()) {
    throw new Error("PASSWORD_EXPORT_SECRET is required for import, export, and password changes in protected environments.");
  }

  return "local-dev-password-export-secret-change-before-production";
}

function isProtectedEnvironment() {
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}
