import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export function encryptionKey(): Buffer | null {
  const value = process.env.NEWS_V2_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}
export function adminConfigured(): boolean { return Boolean(process.env.NEWS_V2_ADMIN_TOKEN?.trim()); }
export function adminAuthorized(header: string | undefined): boolean {
  const token = process.env.NEWS_V2_ADMIN_TOKEN?.trim();
  if (!token || !header) return false;
  const provided = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
export function encryptCredentials(credentials: Record<string, string>): string {
  const key = encryptionKey();
  if (!key) throw new Error("NEWS_V2_ENCRYPTION_KEY must contain a 32-byte encryption key.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}
export function decryptCredentials(value: string | null): Record<string, string> {
  if (!value) return {};
  const key = encryptionKey();
  if (!key) throw new Error("Provider credentials are unavailable: server encryption key is missing.");
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Stored provider credentials are unreadable.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((item) => typeof item !== "string")) throw new Error();
    return parsed as Record<string, string>;
  } catch { throw new Error("Stored provider credentials are unreadable."); }
}

export function safePublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
    return url.href;
  } catch { return null; }
}
