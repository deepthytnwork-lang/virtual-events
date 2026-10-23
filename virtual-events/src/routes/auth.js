const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { users, nextId } = require('../store');
const { sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['organizer', 'attendee'];

const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'attendee' } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });

    const normalized = email.toLowerCase();
    if ([...users.values()].some((u) => u.email === normalized)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = {
      id: nextId('user'),
      name,
      email: normalized,
      passwordHash: await bcrypt.hash(password, config.bcryptRounds),
      role,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);

    // Fire-and-forget: a mail failure must not fail the registration.
    sendWelcomeEmail(user).catch((err) => console.error('Welcome email failed:', err.message));

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = [...users.values()].find((u) => u.email === String(email).toLowerCase());
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
