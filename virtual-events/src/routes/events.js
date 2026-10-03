const express = require('express');
const { events, users, nextId } = require('../store');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEventRegistrationEmail } = require('../services/emailService');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const view = (e) => ({ ...e, participantCount: e.participants.length });

function validate(body, partial = false) {
  const errors = [];
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) if (!body.title || typeof body.title !== 'string') errors.push('title is required');
  if (!partial || has('description')) if (!body.description || typeof body.description !== 'string') errors.push('description is required');
  if (!partial || has('date')) if (!DATE_RE.test(body.date || '') || isNaN(Date.parse(body.date))) errors.push('date must be YYYY-MM-DD');
  if (!partial || has('time')) if (!TIME_RE.test(body.time || '')) errors.push('time must be HH:MM (24h)');
  if (has('capacity') && (!Number.isInteger(body.capacity) || body.capacity < 1)) errors.push('capacity must be a positive integer');
  return errors;
}

function loadEvent(req, res, next) {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  req.event = event;
  next();
}

function ownsEvent(req, res, next) {
  if (req.event.organizerId !== req.user.id) {
    return res.status(403).json({ error: 'You can only manage events you created' });
  }
  next();
}

// Public listing
router.get('/', (req, res) => res.json({ events: [...events.values()].map(view) }));

// Events the current user is registered for
router.get('/me/registrations', authenticate, (req, res) => {
  const mine = [...events.values()].filter((e) => e.participants.includes(req.user.id));
  res.json({ events: mine.map(view) });
});

router.get('/:id', loadEvent, (req, res) => res.json({ event: view(req.event) }));

router.post('/', authenticate, requireRole('organizer'), (req, res) => {
  const errors = validate(req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  const { title, description, date, time, capacity } = req.body;
  const now = new Date().toISOString();
  const event = {
    id: nextId('event'), title, description, date, time,
    capacity: capacity ?? null,
    organizerId: req.user.id,
    participants: [],
    createdAt: now, updatedAt: now,
  };
  events.set(event.id, event);
  res.status(201).json({ event: view(event) });
});

router.put('/:id', authenticate, requireRole('organizer'), loadEvent, ownsEvent, (req, res) => {
  const body = req.body || {};
  const errors = validate(body, true);
  if (errors.length) return res.status(400).json({ errors });
  if (body.capacity !== undefined && body.capacity < req.event.participants.length) {
    return res.status(400).json({ error: 'capacity cannot be lower than current participant count' });
  }
  for (const k of ['title', 'description', 'date', 'time', 'capacity']) {
    if (body[k] !== undefined) req.event[k] = body[k];
  }
  req.event.updatedAt = new Date().toISOString();
  res.json({ event: view(req.event) });
});

router.delete('/:id', authenticate, requireRole('organizer'), loadEvent, ownsEvent, (req, res) => {
  events.delete(req.event.id);
  res.status(204).end();
});

// Organizer view of participants
router.get('/:id/participants', authenticate, requireRole('organizer'), loadEvent, ownsEvent, (req, res) => {
  const participants = req.event.participants.map((id) => {
    const u = users.get(id);
    return { id: u.id, name: u.name, email: u.email };
  });
  res.json({ participants });
});

router.post('/:id/register', authenticate, loadEvent, (req, res) => {
  const { event, user } = req;
  if (event.participants.includes(user.id)) return res.status(409).json({ error: 'Already registered for this event' });
  if (event.capacity !== null && event.participants.length >= event.capacity) {
    return res.status(409).json({ error: 'Event is full' });
  }
  event.participants.push(user.id);
  sendEventRegistrationEmail(user, event).catch((err) => console.error('Registration email failed:', err.message));
  res.status(201).json({ message: 'Registered successfully', event: view(event) });
});

router.delete('/:id/register', authenticate, loadEvent, (req, res) => {
  const idx = req.event.participants.indexOf(req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'You are not registered for this event' });
  req.event.participants.splice(idx, 1);
  res.status(204).end();
});

module.exports = router;
