import jwt from "jsonwebtoken";

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required");
  return s;
};

export function signToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, SECRET(), { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET());
  } catch {
    return null;
  }
}
