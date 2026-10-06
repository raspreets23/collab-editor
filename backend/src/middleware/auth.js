import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

/**
 * Authentication Middleware for Express REST Endpoints
 * 
 * Verifies the JWT Bearer token passed in the Authorization header.
 * If valid, fetches the user from the database (excluding passwordHash)
 * and attaches it to `req.user`. If invalid or missing, returns 401 Unauthorized.
 */
export const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: No bearer token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Decode and verify the token signature
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Invalid token payload.',
      });
    }

    // Attach user record to request context
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: User no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Token has expired.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Authentication failed: Invalid or malformed token.',
    });
  }
};

export default authenticateJWT;

