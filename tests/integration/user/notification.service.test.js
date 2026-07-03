/** user/notification.service — list + đánh dấu đã đọc. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/notification.service');
const Notification = require('../../../src/models/log/Notification');

let user;
const mk = (over = {}) =>
  Notification.create({ user: user._id, type: 'general', title: 'T', message: 'M', ...over });

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); user = await f.createUser(); });

test('list trả items + số chưa đọc', async () => {
  await mk();
  await mk({ isRead: true });
  const res = await svc.list(user._id);
  expect(res.items).toHaveLength(2);
  expect(res.unread).toBe(1);
});

test('markRead đánh dấu 1 thông báo', async () => {
  const n = await mk();
  const updated = await svc.markRead(user._id, n._id);
  expect(updated.isRead).toBe(true);
});

test('markRead thông báo không thuộc user → 404', async () => {
  const other = await f.createUser();
  const n = await Notification.create({ user: other._id, type: 'general', title: 'T', message: 'M' });
  await expect(svc.markRead(user._id, n._id)).rejects.toMatchObject({ statusCode: 404 });
});

test('markAllRead: mọi thông báo về đã đọc', async () => {
  await mk(); await mk();
  await svc.markAllRead(user._id);
  const res = await svc.list(user._id);
  expect(res.unread).toBe(0);
});
