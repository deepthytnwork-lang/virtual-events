// In-memory data store. Data is lost when the process restarts.
const users = new Map();   // id -> { id, name, email, passwordHash, role, createdAt }
const events = new Map();  // id -> { id, title, description, date, time, capacity, organizerId, participants[], createdAt, updatedAt }
let seq = { user: 0, event: 0 };

const nextId = (kind) => String(++seq[kind]);

function reset() {
  users.clear();
  events.clear();
  seq = { user: 0, event: 0 };
}

module.exports = { users, events, nextId, reset };
