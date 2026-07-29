/**
 * GET /api/users/feedbacks is unauthenticated and consumed by the public web
 * Reviews page. These tests pin the DTO: any future populate/spread that leaks
 * reviewer identity, plate/session data or image URLs must fail here.
 */
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const Feedback = require('../../../src/models/operations/Feedback');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const BuildingManager = require('../../../src/models/building/BuildingManager');
const { signToken } = require('../../../src/utils/token');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

const SECRET_PLATE = '59G2-038.80';
const PORTRAIT_URL = 'https://cdn.example.com/portrait-secret.jpg';
const PLATE_IMAGE_URL = 'https://cdn.example.com/plate-secret.jpg';

async function seedFeedback(over = {}) {
  const building = await f.createBuilding();
  const user = await f.createUser({ fullName: 'Nguyen Van Secret' });
  const session = await ParkingSession.create({
    building: building._id,
    user: user._id,
    plateNumber: SECRET_PLATE,
    entryTime: new Date(),
    status: 'completed',
  });
  const feedback = await Feedback.create({
    user: user._id,
    building: building._id,
    parkingSession: session._id,
    rating: 5,
    comment: 'Clean and fast',
    status: 'resolved',
    staffReply: 'Thanks!',
    repliedAt: new Date(),
    portraitImageUrl: PORTRAIT_URL,
    plateImageUrl: PLATE_IMAGE_URL,
    ...over,
  });
  return { building, user, session, feedback };
}

describe('Public feedback DTO', () => {
  test('exposes only the allowlisted public fields', async () => {
    const { building, feedback } = await seedFeedback();

    const res = await request(app).get('/api/users/feedbacks');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toEqual({
      id: String(feedback._id),
      rating: 5,
      comment: 'Clean and fast',
      building: { id: String(building._id), name: building.name, code: building.code },
      staffReply: 'Thanks!',
      repliedAt: expect.any(String),
      status: 'resolved',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  test('never leaks user, session, plate or image data anywhere in the payload', async () => {
    const { user, session } = await seedFeedback();

    const res = await request(app).get('/api/users/feedbacks');
    const raw = JSON.stringify(res.body);

    expect(raw).not.toContain(SECRET_PLATE);
    expect(raw).not.toContain(PORTRAIT_URL);
    expect(raw).not.toContain(PLATE_IMAGE_URL);
    expect(raw).not.toContain('Nguyen Van Secret');
    expect(raw).not.toContain(user.email);
    expect(raw).not.toContain(String(user._id));
    expect(raw).not.toContain(String(session._id));
    expect(raw).not.toMatch(/portraitImageUrl|plateImageUrl|plateNumber|repliedBy|parkingSession/);
    expect(Object.keys(res.body.data.items[0])).not.toContain('user');
  });

  test('publishes only resolved feedback', async () => {
    await seedFeedback({ status: 'pending', comment: 'Unmoderated rant' });

    const res = await request(app).get('/api/users/feedbacks');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);
  });

  test('filters by building using either building or buildingId', async () => {
    const { building } = await seedFeedback();
    await seedFeedback();

    const byBuilding = await request(app).get('/api/users/feedbacks').query({ building: String(building._id) });
    const byBuildingId = await request(app).get('/api/users/feedbacks').query({ buildingId: String(building._id) });

    expect(byBuilding.body.data.items).toHaveLength(1);
    expect(byBuildingId.body.data.items).toHaveLength(1);
  });

  test('rejects a malformed building filter instead of ignoring it', async () => {
    const res = await request(app).get('/api/users/feedbacks').query({ building: 'not-an-id' });
    expect(res.status).toBe(400);
  });
});

describe('Feedback submission invariants', () => {
  const createCompletedSession = (user, building) => ParkingSession.create({
    building: building._id,
    user: user._id,
    plateNumber: '51F-456.78',
    status: 'completed',
    entryTime: new Date(Date.now() - 3600_000),
    exitTime: new Date(),
  });

  test('derives the building from the completed session instead of the client payload', async () => {
    const building = await f.createBuilding();
    const clientBuilding = await f.createBuilding();
    const user = await f.createUser();
    const session = await createCompletedSession(user, building);

    const res = await request(app)
      .post('/api/users/feedbacks')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ parkingSession: session._id, building: clientBuilding._id, rating: 5, comment: 'Accurate building' });

    expect(res.status).toBe(200);
    const feedback = await Feedback.findOne({ parkingSession: session._id });
    expect(`${feedback.building}`).toBe(`${building._id}`);
  });

  test('rejects an active or another user\'s session', async () => {
    const building = await f.createBuilding();
    const user = await f.createUser();
    const otherUser = await f.createUser();
    const active = await ParkingSession.create({ building: building._id, user: user._id, plateNumber: '51F-456.79', status: 'active' });
    const completed = await createCompletedSession(otherUser, building);

    const activeRes = await request(app)
      .post('/api/users/feedbacks')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ parkingSession: active._id, rating: 5, comment: 'Too early' });
    expect(activeRes.status).toBe(409);
    expect(activeRes.body.errorCode).toBe('PARKING_SESSION_NOT_COMPLETED');

    const otherRes = await request(app)
      .post('/api/users/feedbacks')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ parkingSession: completed._id, rating: 5, comment: 'Not mine' });
    expect(otherRes.status).toBe(404);
    expect(otherRes.body.errorCode).toBe('PARKING_SESSION_NOT_FOUND');
  });

  test('parallel submissions for one session create exactly one feedback', async () => {
    const building = await f.createBuilding();
    const user = await f.createUser();
    const session = await createCompletedSession(user, building);
    const post = () => request(app)
      .post('/api/users/feedbacks')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ parkingSession: session._id, rating: 5, comment: 'One review only' });

    const [first, second] = await Promise.all([post(), post()]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first.body.errorCode, second.body.errorCode]).toContain('FEEDBACK_ALREADY_EXISTS');
    expect(await Feedback.countDocuments({ user: user._id, parkingSession: session._id })).toBe(1);
  });
});

describe('Full feedback detail requires authentication and building scope', () => {
  test('manager feedback list rejects unauthenticated callers', async () => {
    const { building } = await seedFeedback();

    const res = await request(app).get(`/api/manager/buildings/${building._id}/feedbacks`);

    expect(res.status).toBe(401);
  });

  test('manager of another building cannot read the full record', async () => {
    const { building } = await seedFeedback();
    const otherBuilding = await f.createBuilding();
    const outsider = await f.createUser({ role: 'manager' });
    await BuildingManager.create({ building: otherBuilding._id, user: outsider._id, isActive: true });

    const res = await request(app)
      .get(`/api/manager/buildings/${building._id}/feedbacks`)
      .set('Authorization', `Bearer ${signToken(outsider)}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_PLATE);
  });

  test('the owning manager still receives the full record including plate data', async () => {
    const { building } = await seedFeedback();
    const manager = await f.createUser({ role: 'manager' });
    await BuildingManager.create({ building: building._id, user: manager._id, isActive: true });

    const res = await request(app)
      .get(`/api/manager/buildings/${building._id}/feedbacks`)
      .set('Authorization', `Bearer ${signToken(manager)}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(SECRET_PLATE);
  });
});
