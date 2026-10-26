// -----------------------------------------------------------------------------
// The "Habitica dailies" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the check buttons, the "Start my day"
// button before the new day, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BASE_CONFIG, createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en') {
  const ack = await w.fake.widgetGet('dailies_today', { settings: {}, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);

test('tiles, the dailies left then the overdue to-dos, a check button per daily', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Dailies left', 1],
      ['Health', 50],
    ],
  );
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value, row.color]),
    [
      ['Méditer 10 minutes', 'Daily', 'warning'],
      ['Payer la cantine', 'Overdue to-do · 20 Oct', 'danger'],
    ],
  );
  const [button] = ofType(data, 'button');
  assert.deepEqual(button.action, {
    key: 'check_1',
    params: { id: w.server.task('Méditer 10 minutes').id },
  });
  const ack = await w.fake.widgetAction('dailies_today', button.action.key, button.action.params, {
    language: 'en',
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, '« Méditer 10 minutes » cochée.');
  assert.equal(w.server.task('Méditer 10 minutes').completed, true);
  const after = await content(w, 'fr');
  assert.equal(ofType(after, 'text')[0].text, "Toutes les quotidiennes sont faites aujourd'hui.");
  assert.equal(ofType(after, 'button').length, 0);
});

test('a second tap on a stale widget does not score twice', async (t) => {
  const w = await world(t);
  const [button] = ofType(await content(w), 'button');
  const tap = () =>
    w.fake.widgetAction('dailies_today', button.action.key, button.action.params, {});
  const [first, second] = await Promise.all([tap(), tap()]);
  assert.equal(first.success, true);
  assert.match(second.error, /already checked/);
  const scores = w.server.requests.filter((r) => r.path.endsWith('/score/up'));
  assert.equal(scores.length, 1);
});

test('a button only checks a daily, never another task', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction(
    'dailies_today',
    'check_1',
    { id: w.server.task('Grignoter').id },
    {},
  );
  assert.equal(ack.success, false);
});

test('before the new day: a caption and "Start my day" instead of the checks', async (t) => {
  const w = await world(t);
  w.server.user.lastCron = '2026-10-25T08:00:00.000Z';
  await w.hub.poll();
  const data = await content(w);
  assert.equal(ofType(data, 'text')[0].text, 'New day not started in Habitica yet.');
  assert.deepEqual(
    ofType(data, 'button').map((b) => b.action.key),
    ['start_day'],
  );
  const ack = await w.fake.widgetAction('dailies_today', 'start_day', {}, {});
  assert.equal(ack.data.message.en, 'New Habitica day started.');
  assert.equal(w.hub.needsCron, false);
});

test('not configured, never answered, stale: a message, never an error', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match(ofType(await content(empty), 'text')[0].text, /user id and API token/);
  const down = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.99' } });
  assert.match(ofType(await content(down), 'text')[0].text, /does not answer/);
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.equal(ofType(stale, 'text')[0].text, 'Habitica does not answer: last known dailies.');
  assert.equal(ofType(stale, 'button').length, 0);
});

test('the content stays within the budget with many dailies and to-dos', async (t) => {
  const w = await world(t);
  const template = w.server.task('Méditer 10 minutes');
  for (let i = 0; i < 15; i += 1) {
    w.server.tasks.push({
      ...structuredClone(template),
      id: `d-${i}`,
      text: `Daily ${i} `.repeat(8),
    });
  }
  await w.hub.poll();
  const data = await content(w, 'de');
  assert.equal(ofType(data, 'status')[0].items.length, 10);
  assert.equal(ofType(data, 'button').length, 4);
});
