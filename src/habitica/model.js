// -----------------------------------------------------------------------------
// From the raw Habitica answers to what Gladys shows: the character, the
// tasks, and the Habitica day (it starts at the "Custom Day Start" hour of the
// user, `preferences.dayStart`, in the time zone of Gladys, injected by the
// supervisor as TZ).
//
// Definitions, the same in the device, the widget, the scene action and the
// documentation:
//   - dailies of the day: the dailies Habitica says are due today (`isDue`,
//     computed by the server for the moment of the reading);
//   - dailies left: those not checked yet. While the new Habitica day has not
//     started (the user did not open Habitica since the day changed, so its
//     "cron" did not run), every daily of the day counts as left: the cron is
//     about to uncheck them all;
//   - overdue to-dos: open to-dos whose due date is before today.
// -----------------------------------------------------------------------------

const HOUR_MS = 60 * 60_000;

const time = (value) => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const number = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

// Habitica's fixed maximum of health points.
export const MAX_HEALTH = 50;

/**
 * The character, from GET /api/v3/user.
 * @returns {{ id: string, name: string, health: number, mana: number, experience: number,
 *   gold: number, level: number, className: string, dayStart: number, lastCron: number|null,
 *   sleeping: boolean }}
 */
export function parseUser(raw) {
  const user = raw && typeof raw === 'object' ? raw : {};
  const stats = user.stats && typeof user.stats === 'object' ? user.stats : {};
  const preferences =
    user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
  const dayStart = Number.isInteger(preferences.dayStart) ? preferences.dayStart : 0;
  const id = text(user.id) || text(user._id);
  return {
    id,
    name: text(user.profile?.name) || text(user.auth?.local?.username) || id,
    health: number(stats.hp),
    mana: number(stats.mp),
    experience: number(stats.exp),
    gold: number(stats.gp),
    level: number(stats.lvl, 1),
    className: text(stats.class),
    dayStart: dayStart >= 0 && dayStart <= 23 ? dayStart : 0,
    lastCron: time(user.lastCron),
    sleeping: preferences.sleep === true,
  };
}

export const TASK_TYPES = Object.freeze({
  HABIT: 'habit',
  DAILY: 'daily',
  TODO: 'todo',
  REWARD: 'reward',
});

/**
 * Tasks of GET /api/v3/tasks/user (rewards and completed to-dos left out),
 * in the order of the lists of Habitica.
 * @returns {Array<{ id: string, type: string, title: string, completed: boolean,
 *   isDue: boolean, dueAt: number|null, up: boolean, down: boolean }>}
 */
export function parseTasks(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((task) => task && typeof task.id === 'string' && task.id !== '')
    .filter((task) => [TASK_TYPES.HABIT, TASK_TYPES.DAILY, TASK_TYPES.TODO].includes(task.type))
    .filter((task) => !(task.type === TASK_TYPES.TODO && task.completed === true))
    .map((task) => ({
      id: task.id,
      type: task.type,
      title: text(task.text) || task.id.slice(0, 8),
      completed: task.completed === true,
      isDue: task.isDue === true,
      dueAt: task.type === TASK_TYPES.TODO ? time(task.date) : null,
      up: task.up !== false,
      down: task.down !== false,
    }));
}

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
  return parts;
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Start and end (exclusive) of the local day holding `now`. */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const start = localMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}
/**
 * The Habitica day holding `now`: from the "Custom Day Start" hour to the
 * same hour the next day, in the local time of Gladys.
 */
export function habiticaDay(now, timeZone, dayStart = 0) {
  // The hour on the local clock, even on a day the clocks change.
  const at = (midnight) => {
    const guess = midnight + dayStart * HOUR_MS;
    return guess - (offsetAt(guess, timeZone) - offsetAt(midnight, timeZone));
  };
  const today = localDay(now, timeZone);
  const start = at(today.start);
  if (now < start) {
    return { start: at(localDay(today.start - 1, timeZone).start), end: start };
  }
  return { start, end: at(today.end) };
}

/** `YYYY-MM-DD` of an instant, in a time zone. */
export function localDate(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * The calendar day of a to-do due date. Habitica stores a date: the API
 * writes it as UTC midnight, the apps as local midnight.
 */
export function dueDate(ms, timeZone) {
  if (ms % (24 * HOUR_MS) === 0) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  return localDate(ms, timeZone);
}

/**
 * Counters of the Habitica day.
 * @param {ReturnType<typeof parseTasks>} tasks
 * @param {{ day: { start: number, end: number }, timeZone: string, needsCron: boolean }} options
 */
export function summarize(tasks, { day, timeZone, needsCron }) {
  const dailies = tasks.filter((task) => task.type === TASK_TYPES.DAILY && task.isDue);
  const left = dailies.filter((task) => needsCron || !task.completed);
  const today = localDate(day.start, timeZone);
  const overdue = tasks.filter(
    (task) =>
      task.type === TASK_TYPES.TODO && task.dueAt !== null && dueDate(task.dueAt, timeZone) < today,
  );
  return {
    dailies: dailies.length,
    dailiesLeft: left.length,
    left,
    todosOverdue: overdue.length,
    overdue,
  };
}

const fold = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Find a task by its id (the UUID of Habitica) or its exact title (case,
 * accents and repeated blanks ignored).
 * @template {{ id: string, title: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findTask(items, query) {
  const wanted = String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const byId = items.find((item) => item.id === wanted.toLowerCase());
  if (byId) {
    return { item: byId };
  }
  const matches = items.filter((item) => fold(item.title) === fold(wanted));
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
