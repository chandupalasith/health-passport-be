const jwt = require('jsonwebtoken');

/**
 * verifyToken
 * Reads the JWT from the httpOnly cookie, verifies its signature, and
 * attaches the decoded payload to req.user.
 *
 * Payload shape: { userId, labId, role }
 *
 * No database hit here — the payload carries everything downstream
 * middleware needs. The /me endpoint does a fresh DB lookup when the
 * caller explicitly wants current user data.
 */
function verifyToken(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated — please log in.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, labId, role, iat, exp }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired — please log in again.'
        : 'Invalid token.';
    return res.status(401).json({ message });
  }
}

/**
 * requireRole(role)
 * Factory that returns a middleware enforcing a minimum role.
 * Always call this AFTER verifyToken.
 *
 * Usage:
 *   router.delete('/users/:id', verifyToken, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: `Access denied — required role: ${roles.join(' or ')}.` });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
