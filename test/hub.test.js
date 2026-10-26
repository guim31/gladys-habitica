// -----------------------------------------------------------------------------
// The hub against the fake Habitica: the device and its states, the scene
// events (reminder, level, health, every daily done), the scene actions, the
// new day not started yet, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  FakeHabitica,
  START,
  characterId,
  createAll,
  createClock,
  createWorld,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, key) => w.fake.lastState(characterId(w.gladys).feature(key));
const events = (w) => w.fake.sceneEvents.map((event) => [event.key, event.data]);

test('one device for the character, its states from the real answers', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.equal(device.name, 'Habitica gladystest');
  assert.equal(device.external_id, characterId(w.gladys).device);
  await createAll(w);
  assert.equal(state(w, 'health'), 50);
  assert.equal(state(w, 'level'), 1);
  assert.equal(state(w, 'experience'), 18);
  assert.equal(state(w, 'gold'), 3);
  assert.equal(state(w, 'dailies_left'), 1, 'Méditer; Arroser is checked, Poubelles on Thursdays');
  assert.equal(state(w, 'todos_overdue'), 1, 'Payer la cantine, due on 20/10');
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the credentials and the dueDate go with every reading', async (t) => {
  const w = await world(t);
  const tasks = w.server.requests.find((r) => r.path === '/api/v3/tasks/user');
  assert.equal(new URLSearchParams(tasks.search).get('dueDate'), new Date(START).toISOString());
  assert.equal(tasks.headers['x-client'], `${BASE_CONFIG.user_id}-gladys`);
  assert.equal(tasks.headers['x-api-user'], BASE_CONFIG.user_id);
  const user = w.server.requests.find((r) => r.path === '/api/v3/user');
  assert.match(new URLSearchParams(user.search).get('userFields'), /stats/);
});

test('habitica.com is published as a cloud device, a server of your own as local', async (t) => {
  const local = await world(t);
  assert.equal(local.fake.transports.at(-1).transport, 'local');
  const cloud = await world(t, { config: { ...BASE_CONFIG, url: '' } });
  assert.equal(cloud.hub.config.url, 'https://habitica.com');
  assert.equal(cloud.fake.transports.at(-1).transport, 'cloud');
});

test('the first reading fires nothing; a level gained and low health do', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, health_threshold: '20' } });
  assert.deepEqual(events(w), []);
  w.server.stats.lvl = 2;
  w.server.stats.hp = 19.2;
  w.clock.advance(5 * 60_000);
  await w.hub.poll();
  // 19.2 is shown 20 by Habitica (rounded up): not below 20 yet.
  assert.deepEqual(events(w), [['level_up', { level: 2, previous_level: 1, class: 'warrior' }]]);
  w.server.stats.hp = 18.5;
  await w.hub.poll();
  assert.deepEqual(events(w).at(-1), ['health_low', { health: 19, threshold: 20, level: 2 }]);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 2, 'once per crossing');
});

test('every daily done fires once, when the last one is checked from anywhere', async (t) => {
  const w = await world(t);
  w.server.task('Méditer 10 minutes').completed = true;
  await w.hub.poll();
  assert.deepEqual(events(w), [['all_dailies_done', { dailies: 2 }]]);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('the reminder fires for every daily left, at its time, once', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, reminder_hours: '3' } });
  w.clock.time = Date.UTC(2026, 9, 26, 19, 59); // 20:59 in Paris
  await w.hub.poll();
  assert.deepEqual(events(w), []);
  assert.equal(w.hub.nextDelay(), 60_000 + 5_000, 'wakes up at 21:00 Paris');
  w.clock.time = Date.UTC(2026, 9, 26, 20, 0, 5);
  await w.hub.poll();
  assert.deepEqual(events(w), [
    [
      'daily_pending',
      {
        task: 'Méditer 10 minutes',
        task_id: w.server.task('Méditer 10 minutes').id,
        dailies_left: 1,
        hours_left: 3,
      },
    ],
  ]);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('a refused event is fired again at the next reading', async (t) => {
  const w = await world(t);
  w.server.task('Méditer 10 minutes').completed = true;
  t.mock.method(w.gladys, 'publishSceneEvent', async () => {
    throw new Error('Gladys restarting');
  });
  await w.hub.poll();
  t.mock.restoreAll();
  await w.hub.poll();
  assert.deepEqual(events(w), [['all_dailies_done', { dailies: 2 }]]);
});

test('a restart neither repeats nor loses an event (state under /data)', async (t) => {
  const clock = createClock();
  const server = new FakeHabitica({ now: clock.now });
  const first = await createWorld({ clock, server });
  const { dataDir } = first;
  await first.app.stop();
  server.stats.lvl = 3;
  const second = await world(t, { clock, server, dataDir });
  assert.deepEqual(events(second), [
    ['level_up', { level: 3, previous_level: 1, class: 'warrior' }],
  ]);
  await second.app.stop();
  const third = await world(t, { clock, server, dataDir });
  assert.deepEqual(events(third), []);
});

test('the new day not started yet: every daily of the day is left, no "all done"', async (t) => {
  const w = await world(t);
  w.server.task('Méditer 10 minutes').completed = true;
  w.server.user.lastCron = '2026-10-25T08:00:00.000Z';
  await w.hub.poll();
  assert.equal(w.hub.needsCron, true);
  assert.equal(state(w, 'dailies_left'), 2, 'the cron will uncheck both');
  assert.deepEqual(events(w), []);
});

test('checking a task before the day started starts it first', async (t) => {
  const w = await world(t);
  w.server.user.lastCron = '2026-10-25T08:00:00.000Z';
  const ack = await w.fake.sceneAction('score_task', { task: 'arroser les plantes' });
  assert.equal(ack.success, true, ack.error);
  const posts = w.server.requests.filter((r) => r.method === 'POST').map((r) => r.path);
  assert.deepEqual(posts, [
    '/api/v3/cron',
    `/api/v3/tasks/${w.server.task('Arroser les plantes').id}/score/up`,
  ]);
  assert.equal(w.server.task('Arroser les plantes').completed, true);
  assert.equal(w.hub.needsCron, false);
});

test('score_task: a habit + and −, a to-do, titles found without case or accents', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('score_task', { task: "BOIRE un verre d'eau" });
  assert.deepEqual(ack.data.outputs, {
    task: "Boire un verre d'eau",
    task_type: 'habit',
    health: 50,
    level: 2,
    gold: 4,
  });
  ack = await w.fake.sceneAction('score_task', { task: 'grignoter', direction: 'down' });
  assert.equal(ack.data.outputs.health, 48);
  ack = await w.fake.sceneAction('score_task', { task: 'Payer la cantine' });
  assert.equal(ack.data.outputs.task_type, 'todo');
  assert.equal(state(w, 'todos_overdue'), 0);
});

test('score_task errors: unknown, already checked, not due today, empty', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  let ack = await w.fake.sceneAction('score_task', { task: 'Faire du vélo' });
  assert.match(ack.error, /Aucune habitude/);
  ack = await w.fake.sceneAction('score_task', { task: 'Arroser les plantes' });
  assert.match(ack.error, /déjà cochée/);
  ack = await w.fake.sceneAction('score_task', { task: 'Sortir les poubelles' });
  assert.match(ack.error, /pas à faire aujourd'hui/);
  ack = await w.fake.sceneAction('score_task', { task: ' ' });
  assert.match(ack.error, /Indiquez le titre/);
});

test('create_todo, start_day and read_status', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('create_todo', { title: ' Appeler le plombier ' });
  assert.equal(ack.data.outputs.task, 'Appeler le plombier');
  assert.ok(w.server.task('Appeler le plombier'));
  ack = await w.fake.sceneAction('read_status', {});
  assert.deepEqual(ack.data.outputs, {
    text: '1 daily(ies) left today: Méditer 10 minutes. 1 overdue to-do(s). Health 50/50, level 1.',
    dailies_left: 1,
    todos_overdue: 1,
    health: 50,
    level: 1,
  });
  ack = await w.fake.sceneAction('start_day', {});
  assert.equal(ack.success, true);
  assert.ok(w.server.requests.some((r) => r.path === '/api/v3/cron'));
});

test('wrong credentials, no answer, not Habitica, 429: a clear status, no crash', async (t) => {
  const wrong = await world(t, { config: { ...BASE_CONFIG, api_token: 'nope' } });
  assert.equal(wrong.fake.connectionStatus.connected, false);
  assert.equal(wrong.fake.connectionStatus.message.en, 'user id or API token refused');

  const down = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.99' } });
  assert.equal(down.fake.connectionStatus.message.en, 'Habitica does not answer');

  const w = await world(t);
  w.server.rateLimited = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.message.en, 'too many requests, retrying later');
  assert.equal(w.hub.nextDelay(), 60_000);
  w.server.rateLimited = false;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a missing or malformed user id is explained', async (t) => {
  const none = await world(t, { config: { ...BASE_CONFIG, user_id: '' } });
  assert.match(none.fake.connectionStatus.message.en, /Enter your Habitica user id/);
  const bad = await world(t, { config: { ...BASE_CONFIG, user_id: 'gladystest' } });
  assert.match(bad.fake.connectionStatus.message.en, /The user id is a code/);
  assert.equal(bad.server.requests.length, 0);
});

test('test_connection reports the character', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.data.message.en, 'Habitica OK: gladystest, level 1, 1 daily(ies) left today.');
});

test('a refused reminder is sent again alone, not the ones already sent', async (t) => {
  const w = await world(t);
  w.server.task('Arroser les plantes').completed = false;
  w.clock.time = Date.UTC(2026, 9, 26, 20, 59);
  await w.hub.poll();
  let calls = 0;
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  t.mock.method(w.gladys, 'publishSceneEvent', async (key, data) => {
    calls += 1;
    if (calls === 2) {
      throw new Error('Gladys restarting');
    }
    return publish(key, data);
  });
  w.clock.time = Date.UTC(2026, 9, 26, 21, 0, 5);
  await w.hub.poll();
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.data.task),
    ['Méditer 10 minutes', 'Arroser les plantes'],
  );
});

test('the last daily left deleted, not checked: no "all done"', async (t) => {
  const w = await world(t);
  w.server.tasks = w.server.tasks.filter((task) => task.text !== 'Méditer 10 minutes');
  await w.hub.poll();
  assert.deepEqual(events(w), []);
});

test('the day is counted like the server does, with the offset of the account', async (t) => {
  const w = await world(t);
  // Account in UTC+2 (offset −120), Gladys in Paris (UTC+1): the cron ran at
  // 23:30 Paris, already the new day for Habitica.
  w.server.user.preferences.timezoneOffset = -120;
  w.server.user.lastCron = '2026-10-26T22:30:00.000Z';
  w.clock.time = Date.UTC(2026, 9, 26, 23, 30); // 00:30 Paris, the 27th
  await w.hub.poll();
  assert.equal(w.hub.needsCron, false);
});

test('"−" on a to-do or an unchecked daily is refused before any change', async (t) => {
  const w = await world(t);
  w.server.user.lastCron = '2026-10-25T08:00:00.000Z';
  for (const task of ['Payer la cantine', 'Méditer 10 minutes', 'Arroser les plantes']) {
    const ack = await w.fake.sceneAction('score_task', { task, direction: 'down' });
    assert.match(ack.error, /not checked/, task);
  }
  assert.deepEqual(
    w.server.requests.filter((r) => r.method === 'POST'),
    [],
    'no cron, no score',
  );
});

test('refused credentials are not retried every minute', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, api_token: 'nope' } });
  assert.equal(w.hub.nextDelay(), 300_000);
});

test('no daily due today is said so', async (t) => {
  const w = await world(t);
  w.server.tasks = w.server.tasks.filter((task) => task.type !== 'daily');
  const ack = await w.fake.sceneAction('read_status', {});
  assert.match(ack.data.outputs.text, /^No daily due today\./);
});
