/**
 * Simple JWT-based authentication module.
 * Validates tokens and extracts user context.
 */

const crypto = require("crypto");

const SECRET = process.env.AUTH_SECRET || "dev-secret";
const TOKEN_EXPIRY_MS = 3600 * 1000; // 1 hour

function generateToken(userId, role) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('generateToken: userId must be a non-empty string');
  }
  if (!role || typeof role !== 'string') {
    throw new Error('generateToken: role must be a non-empty string');
  }

  const payload = JSON.stringify({
    userId,
    role,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  });
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('hex');
  const token = Buffer.from(payload).toString('base64') + '.' + signature;
  return token;
}

function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: "Token must be a non-empty string" };
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return { valid: false, error: "Malformed token" };
  }

  const payload = Buffer.from(payloadB64, 'base64').toString();
  const expectedSig = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSig) {
    return { valid: false, error: "Invalid signature" };
  }

  const data = JSON.parse(payload);
  if (data.exp <= Date.now()) {
    return { valid: false, error: "Token expired" };
  }

  return { valid: true, userId: data.userId, role: data.role };
}

module.exports = { generateToken, validateToken };
