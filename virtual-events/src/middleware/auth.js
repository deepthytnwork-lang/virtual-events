const jwt = require('jsonwebtoken');
const config = require('../config');
const { users } = require('../store');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = users.get(payload.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const requireRole = (role) => (req, res, next) =>
  req.user.role === role
    ? next()
    : res.status(403).json({ error: `Only ${role}s can perform this action` });

module.exports = { authenticate, requireRole };
