import jwt from 'jsonwebtoken';

/**
 * ============================================================================
 * JWT (JSON Web Token) Flow Overview:
 * ============================================================================
 * 1. Authentication:
 *    - A user submits credentials (email & password) to /api/auth/login or /api/auth/register.
 *    - The backend validates the inputs and checks password hash with bcrypt.
 * 2. Token Issuance:
 *    - On successful verification, the server signs a JWT payload (userId, email, name)
 *      using a symmetric secret key (process.env.JWT_SECRET) with an expiration (e.g., 7 days).
 * 3. Client Storage & Transmission:
 *    - The client receives the JWT token in response and persists it (e.g., in localStorage).
 *    - For all subsequent REST requests, the client attaches the token to the HTTP header:
 *      `Authorization: Bearer <token>`.
 *    - For real-time WebSockets (Socket.io), the token is provided via auth handshake or
 *      during room join events to authenticate the user's socket connection.
 * 4. Verification & Authorization:
 *    - Server middleware decodes and verifies the signature of incoming tokens.
 *    - If valid, the user identity is attached to `req.user` (REST) or `socket.user` (WebSockets).
 *    - If invalid or expired, requests are rejected with a 401 Unauthorized status.
 * ============================================================================
 */

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be defined in production environment');
  }
  return secret || 'collab_editor_jwt_secret_dev_fallback';
};

/**
 * Sign a payload and return a JWT string.
 * @param {Object} payload - Data to embed in the token (e.g., { id, email, name })
 * @param {string|number} expiresIn - Expiration time string (e.g., '7d')
 * @returns {string} - Signed JWT token
 */
export const signToken = (payload, expiresIn = '7d') => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

/**
 * Verify and decode a JWT string.
 * @param {string} token - The JWT string to verify
 * @returns {Object} - Decoded payload if valid
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};

