// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys never polls a device published
// with should_poll: false (nor one created without should_poll,
// GladysAssistant/Gladys#3198): Habitica must be read by the hub's own timer,
// with no onPoll at all — and on time for the reminder between two readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, createAll, createClock, createWorld } from './helpers/world.js';

const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const reads = (server) => server.requests.filter((r) => r.path === '/api/v3/tasks/user').length;

test('the internal timer reads Habitica without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '600' },
    timers: true,
  });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'poll');
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].should_poll, false, 'Gladys is not asked to poll');
  const before = reads(w.server);
  for (let i = 0; i < 3; i += 1) {
    clock.advance(600_000);
    t.mock.timers.tick(600_000);
    await settle();
  }
  assert.equal(reads(w.server) - before, 3, 'one reading per interval');
  assert.ok(polled.mock.callCount() >= 3);
});

test('the timer wakes up at the reminder, shorter than the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock(Date.UTC(2026, 9, 26, 20, 58)); // reminder at 21:00 UTC
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '1800' },
    timers: true,
  });
  t.after(() => w.app.stop());
  clock.advance(125_000);
  t.mock.timers.tick(125_000);
  await settle();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.key),
    ['daily_pending'],
  );
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  await w.app.stop();
  const before = w.server.requests.length;
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
});
