const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours in ms
const JWT_EXPIRES_IN = '8h';

// ── Helpers ───────────────────────────────────────────────────────────────

function signToken({ userId, labId, role }) {
  return jwt.sign(
    { userId, labId: labId.toString(), role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function setAuthCookie(res, token) {
  const prod = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   prod,
    // 'none' is required for cross-origin requests (S3 frontend → EB backend).
    // 'lax' is safe enough for same-origin dev.
    sameSite: prod ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
}

// ── Controllers ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { username, password }
 * username is stored in the `email` field internally for backward compat.
 */
async function login(req, res, next) {
  try {
    // Accept `username` (new) or `email` (legacy seed scripts)
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    // Fetch passwordHash explicitly — it is excluded from queries by default
    const user = await User.findOne({ email: identifier.toLowerCase() })
      .select('+passwordHash')
      .lean(false); // need the Mongoose instance for verifyPassword()

    const valid = user && (await user.verifyPassword(password));
    if (!valid) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = signToken({
      userId: user._id,
      labId: user.labId,
      role: user.role,
    });

    setAuthCookie(res, token);

    return res.json({
      user: {
        userId:   user._id,
        name:     user.name,
        username: user.email,
        role:     user.role,
        labId:    user.labId,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Protected — requires verifyToken
 */
function logout(_req, res) {
  const prod = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax' });
  return res.json({ message: 'Logged out successfully.' });
}

/**
 * GET /api/auth/me
 * Protected — requires verifyToken
 * Does a fresh DB lookup so the response always reflects the latest data.
 */
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select('name role labId email');
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }
    return res.json({
      userId:   user._id,
      name:     user.name,
      username: user.email,
      role:     user.role,
      labId:    user.labId,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me };
