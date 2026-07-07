const jwt              = require('jsonwebtoken');
const User             = require('../models/User');
const Lab              = require('../models/Lab');
const CollectingCenter = require('../models/CollectingCenter');

const COOKIE_NAME    = 'token';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;
const JWT_EXPIRES_IN = '8h';

// ── Helpers ───────────────────────────────────────────────────────────────

function signToken({ userId, labId, role, collectingCenterId }) {
  return jwt.sign(
    { userId, labId: labId.toString(), role, collectingCenterId: collectingCenterId?.toString() || null },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function setAuthCookie(res, token) {
  const prod = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   prod,
    sameSite: prod ? 'none' : 'lax',
    maxAge:   COOKIE_MAX_AGE,
  });
}

async function getCenterName(centerId) {
  if (!centerId) return null;
  const center = await CollectingCenter.findById(centerId).select('name').lean();
  return center?.name || null;
}

// ── Controllers ───────────────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ email: identifier.toLowerCase() })
      .select('+passwordHash')
      .lean(false);

    const valid = user && (await user.verifyPassword(password));
    if (!valid) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Check lab disabled status (super admins bypass this)
    if (user.role !== 'superadmin' && user.labId) {
      const lab = await Lab.findById(user.labId).select('isDisabled disabledReason').lean();
      if (lab?.isDisabled) {
        return res.status(403).json({
          message: lab.disabledReason || 'Your account has been suspended. Please contact support to renew your subscription.',
          code: 'ACCOUNT_DISABLED',
        });
      }
    }

    const token = signToken({
      userId:             user._id,
      labId:              user.labId,
      role:               user.role,
      collectingCenterId: user.collectingCenterId,
    });

    setAuthCookie(res, token);

    const collectingCenterName = await getCenterName(user.collectingCenterId);

    return res.json({
      user: {
        userId:              user._id,
        name:                user.name,
        username:            user.email,
        role:                user.role,
        labId:               user.labId,
        collectingCenterId:  user.collectingCenterId || null,
        collectingCenterName,
      },
    });
  } catch (err) {
    next(err);
  }
}

function logout(_req, res) {
  const prod = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax' });
  return res.json({ message: 'Logged out successfully.' });
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.userId)
      .select('name role labId email collectingCenterId')
      .lean();
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    const collectingCenterName = await getCenterName(user.collectingCenterId);

    return res.json({
      userId:              user._id,
      name:                user.name,
      username:            user.email,
      role:                user.role,
      labId:               user.labId,
      collectingCenterId:  user.collectingCenterId || null,
      collectingCenterName,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me };
