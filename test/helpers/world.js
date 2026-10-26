// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Habitica on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Habitica with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeHabitica, TOKEN, USER_ID, createNetwork } from './fakeHabitica.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:3000';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 26/10/2026 at 16:04 UTC (the last cron at
// 16:03); the tests start at 16:30 UTC (17:30 in Paris). The Habitica day
// (Custom Day Start 0) ends at 23:00 UTC, the 2-hour reminder is at 21:00 UTC.
export const START = Date.UTC(2026, 9, 26, 16, 30, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, user_id: USER_ID, api_token: TOKEN, language: 'en' };

export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-habitica-')),
  timings = {},
  timers = false,
} = {}) {
  const habitica = server ?? new FakeHabitica({ now: clock.now });
  const network = createNetwork({ [URL_1]: habitica, 'https://habitica.com': habitica });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: habitica, app, hub: app.hub, clock, dataDir };
}

export const characterId = (gladys) => gladys.externalIds('character', `user-${USER_ID}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeHabitica, TOKEN, USER_ID };
