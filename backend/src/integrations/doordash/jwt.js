/**
 * Self-signed DoorDash Marketplace JWT (HS256).
 * Official Node snippet: Buffer.from(signing_secret, 'base64') + dd-ver header.
 * @see https://developer.doordash.com/en-US/docs/marketplace/how_to/JWTs/
 */
import jwt from "jsonwebtoken";
import { getDoorDashConfig } from "./config.js";
import { NotConfiguredError } from "../errors.js";

const DEFAULT_TTL_SEC = 300;
const MAX_TTL_SEC = 1800;

/**
 * @param {{ ttlSec?: number }} [opts]
 * @returns {string}
 */
export function createDoorDashJwt(opts = {}) {
  const cfg = getDoorDashConfig();
  if (!cfg.developerId || !cfg.keyId || !cfg.signingSecret) {
    throw new NotConfiguredError(
      "DoorDash JWT credentials missing (DOORDASH_DEVELOPER_ID / DOORDASH_KEY_ID / DOORDASH_SIGNING_SECRET)",
    );
  }

  const ttl = Math.min(MAX_TTL_SEC, Math.max(60, Number(opts.ttlSec) || DEFAULT_TTL_SEC));
  const now = Math.floor(Date.now() / 1000);
  const data = {
    aud: "doordash",
    iss: cfg.developerId,
    kid: cfg.keyId,
    iat: now,
    exp: now + ttl,
  };

  return jwt.sign(data, Buffer.from(cfg.signingSecret, "base64"), {
    algorithm: "HS256",
    header: { "dd-ver": "DD-JWT-V1" },
  });
}
