"use node";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function passwordHash(password: string, salt: string, pepper: string) {
  if (!pepper || !/^[a-f0-9]{32,}$/i.test(salt))
    throw new Error("Security configuration unavailable");
  return scryptSync(password + "\0" + pepper, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
}
export function matches(a: string, b: string) {
  const left = Buffer.from(a, "hex"),
    right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function encryptCustomer(data: unknown, keyHex: string, version = "v1") {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Encryption key unavailable");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("jamroc:customer:" + version));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return [
    version,
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    body.toString("hex"),
  ].join(".");
}
export function decryptCustomer(value: string, keyHex: string) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1") throw new Error("Unknown encryption key version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(iv, "hex"),
  );
  decipher.setAAD(Buffer.from("jamroc:customer:" + version));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(body, "hex")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
