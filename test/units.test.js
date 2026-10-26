// -----------------------------------------------------------------------------
// Unit tests of the pure parts: the address and the user id typed by the
// user, the parsing of real Habitica answers, the Habitica day, the counters,
// the search by title.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig, parseServerUrl } from '../src/config.js';
import { dueDateParam } from '../src/habitica/client.js';
import {
  dueDate,
  findTask,
  habiticaDay,
  parseTasks,
  parseUser,
  summarize,
} from '../src/habitica/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/habitica/${name}.json`, import.meta.url), 'utf8'));
const PARIS = 'Europe/Paris';

test('the address: habitica.com by default, bare host, browser URL, reverse proxy prefix', () => {
  assert.equal(parseServerUrl(''), 'https://habitica.com');
  assert.equal(parseServerUrl('habitica.com'), 'https://habitica.com');
  assert.equal(parseServerUrl('https://habitica.com/today'), 'https://habitica.com');
  assert.equal(parseServerUrl('192.0.2.10:3000'), 'http://192.0.2.10:3000');
  assert.equal(parseServerUrl('http://192.0.2.10:3000/api/v3/'), 'http://192.0.2.10:3000');
  assert.equal(parseServerUrl('https://example.org/habitica/'), 'https://example.org/habitica');
  assert.equal(parseServerUrl('https://user:pass@example.org'), null, 'no credentials');
  assert.equal(parseServerUrl('ftp://example.org'), null);
});

test('the configuration: user id checked, token trimmed, defaults', () => {
  const config = normalizeConfig({
    user_id: ' FE288C5D-45F8-4612-B581-53B4F5AF2F18 ',
    api_token: ' abc ',
    poll_interval: '60',
    health_threshold: 'x',
  });
  assert.equal(config.userId, 'fe288c5d-45f8-4612-b581-53b4f5af2f18');
  assert.equal(config.token, 'abc');
  assert.equal(config.pollIntervalMs, 300_000, '5 minutes at the most often');
  assert.equal(config.healthThreshold, 15);
  assert.equal(config.reminderHours, 2);
  assert.equal(config.language, 'fr');
  assert.equal(config.url, 'https://habitica.com');
  assert.equal(normalizeConfig({ user_id: 'gladystest' }).userId, '');
});

test('the real user: stats, day start, last cron', () => {
  const user = parseUser(fixture('real-user').data);
  assert.deepEqual(
    [user.name, user.health, user.level, user.className, user.dayStart],
    ['gladystest', 50, 1, 'warrior', 0],
  );
  assert.equal(user.lastCron, Date.parse('2026-10-26T16:03:14.908Z'));
});

test('the real tasks: rewards left out, dailies due, to-do dates', () => {
  const tasks = parseTasks(fixture('real-tasks').data);
  assert.deepEqual(
    tasks.map((task) => [task.type, task.title, task.isDue, task.completed]),
    [
      ['habit', 'Grignoter', false, false],
      ['habit', "Boire un verre d'eau", false, false],
      ['daily', 'Sortir les poubelles', false, false],
      ['daily', 'Méditer 10 minutes', true, false],
      ['daily', 'Arroser les plantes', true, true],
      ['todo', 'Réserver le garage', false, false],
      ['todo', 'Payer la cantine', false, false],
    ],
  );
});

test('the Habitica day follows the Custom Day Start, in local time', () => {
  const at = Date.UTC(2026, 9, 26, 3, 0); // 04:00 in Paris
  assert.deepEqual(habiticaDay(at, PARIS, 0), {
    start: Date.UTC(2026, 9, 25, 23, 0),
    end: Date.UTC(2026, 9, 26, 23, 0),
  });
  // Day start at 5: at 04:00 it is still yesterday's Habitica day.
  assert.deepEqual(habiticaDay(at, PARIS, 5), {
    start: Date.UTC(2026, 9, 25, 4, 0),
    end: Date.UTC(2026, 9, 26, 4, 0),
  });
});

test('counters: dailies left, all left before the cron, overdue to-dos', () => {
  const tasks = parseTasks(fixture('real-tasks').data);
  const day = habiticaDay(Date.UTC(2026, 9, 26, 16, 30), PARIS, 0);
  const started = summarize(tasks, { day, timeZone: PARIS, needsCron: false });
  assert.deepEqual([started.dailies, started.dailiesLeft, started.todosOverdue], [2, 1, 1]);
  const notStarted = summarize(tasks, { day, timeZone: PARIS, needsCron: true });
  assert.equal(notStarted.dailiesLeft, 2);
});

test('to-do due dates: UTC midnight from the API, local midnight from the apps', () => {
  assert.equal(dueDate(Date.parse('2026-10-20T00:00:00.000Z'), PARIS), '2026-10-20');
  assert.equal(dueDate(Date.parse('2026-10-19T22:00:00.000Z'), PARIS), '2026-10-20');
});

test('the dueDate parameter is never read as "a date only"', () => {
  assert.equal(dueDateParam(Date.UTC(2026, 9, 26, 0, 0)), '2026-10-26T00:00:01.000Z');
  assert.equal(dueDateParam(Date.UTC(2026, 9, 26, 16, 30)), '2026-10-26T16:30:00.000Z');
});

test('find a task by title (case, accents, blanks ignored) or id; ambiguous', () => {
  const tasks = parseTasks(fixture('real-tasks').data);
  assert.equal(findTask(tasks, ' mediter  10 MINUTES ').item.title, 'Méditer 10 minutes');
  assert.equal(findTask(tasks, tasks[0].id).item.title, 'Grignoter');
  assert.equal(findTask(tasks, '').reason, 'empty');
  assert.equal(findTask(tasks, 'Un épisode de série').reason, 'not_found', 'no reward');
  const twice = [...tasks, { ...tasks[0], id: 'x' }];
  assert.equal(findTask(twice, 'Grignoter').reason, 'ambiguous');
});
