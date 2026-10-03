# virtual-events
Develop a backend system for a virtual event management platform focusing on user registration, event scheduling, and participant management, all managed through in-memory data structures 
# Virtual Event Management Platform – Backend

Express.js REST API for user registration, event scheduling and participant management.
All data lives in memory (resets on restart). Auth uses **bcrypt** + **JWT**; registration triggers an email via **nodemailer**.

## Quick start

```bash
npm install
cp .env.example .env     # optional; sensible defaults exist
npm start                # http://localhost:3000
npm run test             # 11 tests (Jest + Supertest)
```

Without `SMTP_HOST`, emails are simulated (logged to console). Set `SMTP_*` in `.env` to send real mail.

## Project structure

```
src/
  app.js                 Express app (exported for tests)
  server.js              Entry point
  config.js              Env config
  store.js               In-memory users/events (Maps)
  middleware/auth.js     JWT authentication + role guard
  routes/auth.js         POST /register, POST /login
  routes/events.js       Event CRUD + participant endpoints
  services/emailService.js  Async email sending
tests/api.test.js
```

## Roles & authorization

| Role        | Can do |
|-------------|--------|
| `organizer` | Create events; update/delete/list participants of **their own** events |
| `attendee`  | Register/cancel for events, view own registrations |

Any authenticated user (including organizers) can register for events. `role` is set at signup (`attendee` default).

## API

Protected routes need `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | – | `{name, email, password (≥8), role?}` → 201, sends welcome email |
| POST | `/login` | – | `{email, password}` → `{token, user}` |
| GET | `/events` | – | List events |
| GET | `/events/:id` | – | Event details |
| POST | `/events` | organizer | `{title, description, date: "YYYY-MM-DD", time: "HH:MM", capacity?}` |
| PUT | `/events/:id` | owner organizer | Partial update |
| DELETE | `/events/:id` | owner organizer | 204 |
| GET | `/events/:id/participants` | owner organizer | Participant list |
| POST | `/events/:id/register` | user | Register; sends confirmation email; 409 if duplicate/full |
| DELETE | `/events/:id/register` | user | Cancel own registration |
| GET | `/events/me/registrations` | user | Events I'm registered for |

### Example

```bash
curl -X POST localhost:3000/register -H 'Content-Type: application/json' \
  -d '{"name":"Org","email":"org@x.com","password":"password123","role":"organizer"}'
TOKEN=$(curl -s -X POST localhost:3000/login -H 'Content-Type: application/json' \
  -d '{"email":"org@x.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -X POST localhost:3000/events -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Node Meetup","description":"Talks","date":"2030-05-01","time":"18:30"}'
```

## Design notes

- **Async emails** are fire-and-forget (`async/await` + `.catch`), so SMTP failures never fail a request.
- Passwords are hashed with bcrypt; hashes are never returned by the API.
- Errors: 400 validation, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict.
- Set a strong `JWT_SECRET` in production.
