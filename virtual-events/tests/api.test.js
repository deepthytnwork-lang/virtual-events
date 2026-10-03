process.env.NODE_ENV = 'test';
jest.mock('../src/services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({}),
  sendEventRegistrationEmail: jest.fn().mockResolvedValue({}),
}));

const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');
const email = require('../src/services/emailService');

const event = { title: 'Node Meetup', description: 'Talks', date: '2030-05-01', time: '18:30' };

async function signup(name, role) {
  const creds = { name, email: `${name}@test.com`, password: 'password123', role };
  await request(app).post('/register').send(creds);
  const res = await request(app).post('/login').send({ email: creds.email, password: creds.password });
  return res.body.token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeEach(() => { store.reset(); jest.clearAllMocks(); });

describe('auth', () => {
  test('registers a user, hashes password, sends welcome email', async () => {
    const res = await request(app).post('/register').send({ name: 'Ann', email: 'ann@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'ann@test.com', role: 'attendee' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const stored = [...store.users.values()][0];
    expect(stored.passwordHash).not.toBe('password123');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(email.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  test('rejects duplicate email, weak password, bad role', async () => {
    const body = { name: 'Ann', email: 'ann@test.com', password: 'password123' };
    await request(app).post('/register').send(body);
    expect((await request(app).post('/register').send(body)).status).toBe(409);
    expect((await request(app).post('/register').send({ ...body, email: 'b@test.com', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/register').send({ ...body, email: 'c@test.com', role: 'admin' })).status).toBe(400);
  });

  test('login returns JWT; wrong password is 401', async () => {
    await request(app).post('/register').send({ name: 'Ann', email: 'ann@test.com', password: 'password123' });
    const ok = await request(app).post('/login').send({ email: 'ann@test.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeDefined();
    const bad = await request(app).post('/login').send({ email: 'ann@test.com', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });
});

describe('events', () => {
  test('requires authentication and organizer role to create', async () => {
    expect((await request(app).post('/events').send(event)).status).toBe(401);
    const attendee = await signup('att', 'attendee');
    expect((await request(app).post('/events').set(auth(attendee)).send(event)).status).toBe(403);
  });

  test('organizer can create, list, get, update, delete', async () => {
    const org = await signup('org', 'organizer');
    const created = await request(app).post('/events').set(auth(org)).send(event);
    expect(created.status).toBe(201);
    const id = created.body.event.id;

    expect((await request(app).get('/events')).body.events).toHaveLength(1);
    expect((await request(app).get(`/events/${id}`)).body.event.title).toBe('Node Meetup');

    const upd = await request(app).put(`/events/${id}`).set(auth(org)).send({ title: 'Renamed', time: '19:00' });
    expect(upd.status).toBe(200);
    expect(upd.body.event).toMatchObject({ title: 'Renamed', time: '19:00', date: '2030-05-01' });

    expect((await request(app).delete(`/events/${id}`).set(auth(org))).status).toBe(204);
    expect((await request(app).get(`/events/${id}`)).status).toBe(404);
  });

  test('validates input', async () => {
    const org = await signup('org', 'organizer');
    const res = await request(app).post('/events').set(auth(org)).send({ title: 'x', description: 'y', date: 'bad', time: '25:00' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBe(2);
  });

  test('another organizer cannot modify or delete the event', async () => {
    const a = await signup('orga', 'organizer');
    const b = await signup('orgb', 'organizer');
    const { body } = await request(app).post('/events').set(auth(a)).send(event);
    expect((await request(app).put(`/events/${body.event.id}`).set(auth(b)).send({ title: 'Hack' })).status).toBe(403);
    expect((await request(app).delete(`/events/${body.event.id}`).set(auth(b))).status).toBe(403);
  });
});

describe('participants', () => {
  let org, att, id;
  beforeEach(async () => {
    org = await signup('org', 'organizer');
    att = await signup('att', 'attendee');
    id = (await request(app).post('/events').set(auth(org)).send({ ...event, capacity: 1 })).body.event.id;
  });

  test('attendee registers, gets email, sees registration, can cancel', async () => {
    const res = await request(app).post(`/events/${id}/register`).set(auth(att));
    expect(res.status).toBe(201);
    expect(res.body.event.participantCount).toBe(1);
    expect(email.sendEventRegistrationEmail).toHaveBeenCalledTimes(1);

    const mine = await request(app).get('/events/me/registrations').set(auth(att));
    expect(mine.body.events).toHaveLength(1);

    expect((await request(app).delete(`/events/${id}/register`).set(auth(att))).status).toBe(204);
    expect((await request(app).get('/events/me/registrations').set(auth(att))).body.events).toHaveLength(0);
  });

  test('prevents duplicate registration and enforces capacity', async () => {
    await request(app).post(`/events/${id}/register`).set(auth(att));
    expect((await request(app).post(`/events/${id}/register`).set(auth(att))).status).toBe(409);
    const other = await signup('other', 'attendee');
    const full = await request(app).post(`/events/${id}/register`).set(auth(other));
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/full/i);
  });

  test('registering for a missing event is 404; unauthenticated is 401', async () => {
    expect((await request(app).post('/events/999/register').set(auth(att))).status).toBe(404);
    expect((await request(app).post(`/events/${id}/register`)).status).toBe(401);
  });

  test('only the owning organizer can list participants', async () => {
    await request(app).post(`/events/${id}/register`).set(auth(att));
    const res = await request(app).get(`/events/${id}/participants`).set(auth(org));
    expect(res.status).toBe(200);
    expect(res.body.participants[0].email).toBe('att@test.com');
    expect((await request(app).get(`/events/${id}/participants`).set(auth(att))).status).toBe(403);
  });
});
