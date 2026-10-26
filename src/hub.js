// -----------------------------------------------------------------------------
// The Habitica hub: reads the account on a timer of the container, publishes
// the character's counters when they change, fires the scene events (a daily
// still to do some hours before the end of the day, a level gained, health
// falling below a threshold, every daily done), and checks, creates tasks or
// starts the day for the widget and the scene actions.
//
// Gladys never polls the device (should_poll: false): the interval, 5 to 30
// minutes, is beyond the fixed list of the core scheduler, and the scene
// events must fire even when no device was added. The timer also wakes up at
// the reminder moment and at the start of the next Habitica day.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf, isCloud } from './config.js';
import { buildCharacter, characterIds, featureStates } from './devices.js';
import { ERROR_KINDS, HabiticaClient, HabiticaError } from './habitica/client.js';
import {
  MAX_HEALTH,
  TASK_TYPES,
  findTask,
  habiticaDay,
  needsCron,
  parseTasks,
  parseUser,
  resolveTimeZone,
  summarize,
} from './habitica/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  TODAY_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'habitica-hub' });

export const WIDGET_KEY = 'dailies_today';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  DAILY_PENDING: 'daily_pending',
  LEVEL_UP: 'level_up',
  HEALTH_LOW: 'health_low',
  ALL_DAILIES_DONE: 'all_dailies_done',
});

const HOUR_MS = 60 * 60_000;

export const HUB_TIMINGS = {
  // A failed read is tried again this soon (or when a 429 says).
  retryMs: 60_000,
  // Read this long after the reminder moment or the start of the day.
  wakeSlackMs: 5_000,
  // Never read more often than this on the timer.
  minDelayMs: 60_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * HOUR_MS,
  // A reminder this late (Habitica or the integration was down) is dropped.
  maxLateMs: HOUR_MS,
};

// The reading after a command is awaited at most this long: the scene action
// and the widget button answer within their 20 s.
const REFRESH_WAIT_MS = 3_000;
// Titles read out by the "Read Habitica" action.
const MAX_TITLES = 10;

const SLOW_RETRY = new Set([ERROR_KINDS.AUTH, ERROR_KINDS.NOT_HABITICA, ERROR_KINDS.REDIRECT]);

const healthOf = (user) => Math.min(MAX_HEALTH, Math.max(0, Math.ceil(user.health)));

export class HabiticaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/habitica/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = {};
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transport = null;
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    this.user = null;
    this.tasks = [];
    this.day = null;
    this.needsCron = false;
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = saved && typeof saved === 'object' ? saved : {};
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transport = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.userId === config.userId &&
      previous.token === config.token &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.transport = null;
      this.client =
        config.url && config.userId && config.token
          ? new HabiticaClient({
              url: config.url,
              userId: config.userId,
              token: config.token,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language: the device is published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  /** The moment of the "daily still to do" event of a Habitica day. */
  reminderAt(day = this.day) {
    return day.end - this.config.reminderHours * HOUR_MS;
  }

  /** The interval, shortened to the reminder moment or the next day start. */
  nextDelay(readAt = this.now()) {
    if (this.error) {
      // Refused credentials or a wrong address do not fix themselves: a new
      // configuration reads again at once.
      if (SLOW_RETRY.has(this.error.kind)) {
        return this.config.pollIntervalMs;
      }
      const wait = this.error.retryAfterMs ?? 0;
      return Math.max(Math.min(this.config.pollIntervalMs, this.timings.retryMs), wait);
    }
    if (!this.day) {
      return this.config.pollIntervalMs;
    }
    const now = this.now();
    // `readAt`: a moment that passed during the reading is still ahead of it.
    const moments = [this.day.end, this.reminderAt()].filter((moment) => moment > readAt);
    const ahead = moments.filter((moment) => moment + this.timings.wakeSlackMs > now);
    const wake =
      ahead.length === 0 ? Infinity : Math.min(...ahead) - now + this.timings.wakeSlackMs;
    return Math.max(this.timings.minDelayMs, Math.min(this.config.pollIntervalMs, wake));
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      const readAt = this.now();
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay(readAt));
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const { client } = this;
    try {
      const [rawUser, rawTasks] = await Promise.all([client.user(), client.tasks(now)]);
      if (client !== this.client) {
        // The configuration changed during the reading: another account is being read.
        return;
      }
      const user = parseUser(rawUser);
      user.id ||= this.config.userId;
      this.user = user;
      this.tasks = parseTasks(rawTasks);
      this.day = habiticaDay(now, this.timeZone, user.dayStart);
      // The cron of the new day has not run: the user did not open Habitica yet.
      this.needsCron = needsCron(user, now, this.day.start);
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    if (this.readAt !== 0) {
      await this.publishDevices();
      if (!this.error) {
        await this.publishStates();
        await this.fireEvents(now);
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `Habitica at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Habitica at ${host}: level ${this.user.level}, ${this.tasks.length} task(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof HabiticaError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message, retryAfterMs: err.retryAfterMs };
    this.downSince ??= now;
    this.problem(
      'read',
      `Habitica at ${hostOf(this.config.url)}: ${err.message}`,
      undefined,
      'error',
    );
  }

  summary() {
    if (!this.day) {
      return { dailies: 0, dailiesLeft: 0, left: [], todosOverdue: 0, overdue: [] };
    }
    return summarize(this.tasks, {
      day: this.day,
      timeZone: this.timeZone,
      needsCron: this.needsCron,
    });
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    return this.user ? [buildCharacter(this.gladys, this.user, this.language)] : [];
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added the device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.readAt !== 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishStates() {
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(
        featureStates(this.gladys, { user: this.user, summary: this.summary() }),
        { heartbeat: this.timings.heartbeatMs },
      );
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (!this.user) {
      return;
    }
    const transport = this.error
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : isCloud(this.config.url)
        ? DEVICE_TRANSPORTS.CLOUD
        : DEVICE_TRANSPORTS.LOCAL;
    const externalId = characterIds(this.gladys, this.user.id).device;
    const key = `${externalId}|${transport}`;
    if (key === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: externalId, transport }]);
      this.transport = key;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!this.config.userId) {
      return {
        connected: false,
        message: this.config.userIdTyped ? CONNECTION_TEXT.invalidUserId : CONNECTION_TEXT.noUserId,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.user,
      this.tasks,
      this.needsCron,
      this.day?.start ?? null,
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  /**
   * Compare this reading with the previous one (persisted under /data, so a
   * restart neither repeats nor loses an event): the reminder moment crossed,
   * a level gained, health falling below the threshold, the last daily of the
   * day checked. An event Gladys refuses is tried again at the next reading.
   */
  async fireEvents(now) {
    const scope = `${this.config.url}|${this.user.id}`;
    const summary = this.summary();
    const health = healthOf(this.user);
    const current = {
      scope,
      readAt: now,
      level: this.user.level,
      health,
      dayStart: this.day.start,
      dailiesLeft: summary.dailiesLeft,
      leftIds: summary.left.map((task) => task.id),
      reminderSent: null,
    };
    const saved = this.saved;
    if (saved.scope !== scope || !Number.isFinite(saved.readAt)) {
      // First reading of this account: what is already there is not news.
      this.save(current);
      return;
    }
    const next = { ...current };

    // A daily still to do, some hours before the end of the day. Before the
    // cron of the day ran, every daily of the day is still to do.
    const reminder = this.reminderAt();
    const from = Math.max(saved.readAt, now - this.timings.maxLateMs);
    // The dailies already announced for this reminder (a refused event is
    // tried again, not the ones before it).
    const sent = saved.reminderSent?.at === reminder ? saved.reminderSent.ids : [];
    if (reminder > from && reminder <= now) {
      next.reminderSent = { at: reminder, ids: [...sent] };
      for (const task of summary.left.filter((item) => !sent.includes(item.id))) {
        const data = {
          task: task.title,
          task_id: task.id,
          dailies_left: summary.dailiesLeft,
          hours_left: this.config.reminderHours,
        };
        if (!(await this.fire(TRIGGERS.DAILY_PENDING, data))) {
          // Tried again at the next reading, within the hour.
          next.readAt = reminder - 1;
          break;
        }
        next.reminderSent.ids.push(task.id);
      }
    } else if (saved.reminderSent?.at === reminder) {
      next.reminderSent = saved.reminderSent;
    }

    if (Number.isFinite(saved.level) && this.user.level > saved.level) {
      const data = {
        level: this.user.level,
        previous_level: saved.level,
        class: this.user.className,
      };
      if (!(await this.fire(TRIGGERS.LEVEL_UP, data))) {
        next.level = saved.level;
      }
    }

    const threshold = this.config.healthThreshold;
    if (Number.isFinite(saved.health) && saved.health >= threshold && health < threshold) {
      const data = { health, threshold, level: this.user.level };
      if (!(await this.fire(TRIGGERS.HEALTH_LOW, data))) {
        next.health = saved.health;
      }
    }

    // The last daily of the day checked, within the same Habitica day: the
    // dailies left before are checked now (not deleted, nor no longer due).
    const leftBefore = Array.isArray(saved.leftIds) ? saved.leftIds : [];
    const checked = (id) =>
      this.tasks.some((task) => task.id === id && task.isDue && task.completed);
    if (
      saved.dayStart === this.day.start &&
      leftBefore.length > 0 &&
      summary.dailiesLeft === 0 &&
      summary.dailies > 0 &&
      !this.needsCron &&
      leftBefore.every(checked)
    ) {
      if (!(await this.fire(TRIGGERS.ALL_DAILIES_DONE, { dailies: summary.dailies }))) {
        next.dailiesLeft = saved.dailiesLeft;
        next.leftIds = leftBefore;
      }
    }
    this.save(next);
  }

  save(state) {
    this.saved = state;
    this.store.save(state);
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Habitica error, in words for the user (the server's text stays in the logs). */
  explain(err) {
    if (!(err instanceof HabiticaError)) {
      return err;
    }
    const language = this.language;
    const colon = language === 'fr' ? ' : ' : ': ';
    const status = err.status ? ` (HTTP ${err.status})` : '';
    return new Error(`Habitica${colon}${pick(ERROR_TEXT[err.kind], language)}${status}`, {
      cause: err,
    });
  }

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    return this.client;
  }

  /** Read again now, and wait for it a little (the toast should not lag). */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /** One command at a time: two taps on a button must not both score. */
  serial(run) {
    this.commanding = (this.commanding ?? Promise.resolve()).catch(() => {}).then(run);
    return this.commanding;
  }

  /**
   * Check a task (`up`: a habit +, a daily, a to-do) or score it down (a
   * habit −, or uncheck), by title or id. When the new Habitica day has not
   * started, it is started first, as the apps do when opened: otherwise the
   * check would land on yesterday's dailies.
   * @param {string} query
   * @param {object} [options]
   * @param {'up'|'down'} [options.direction]
   * @param {string} [options.type] only this type of task (the widget: daily)
   * @returns {Promise<{ task: object, direction: string, stats: object }>}
   */
  score(query, { direction = 'up', type } = {}) {
    return this.serial(() => this.scoreNow(query, { direction, type }));
  }

  async scoreNow(query, { direction, type }) {
    const client = this.requireClient();
    let task;
    let stats;
    try {
      const now = this.now();
      const [rawUser, rawTasks] = await Promise.all([client.user(), client.tasks(now)]);
      const user = parseUser(rawUser);
      const day = habiticaDay(now, this.timeZone, user.dayStart);
      const tasks = parseTasks(rawTasks).filter((item) => !type || item.type === type);
      const { item, reason } = findTask(tasks, query);
      if (!item) {
        const key = { empty: 'emptyTask', ambiguous: 'taskAmbiguous' }[reason] ?? 'taskNotFound';
        throw new Error(pick(ACTION_TEXT[key], this.language));
      }
      task = item;
      const late = needsCron(user, now, day.start);
      if (
        direction === 'down' &&
        (task.type === TASK_TYPES.TODO ||
          (task.type === TASK_TYPES.DAILY && (late || !task.completed)))
      ) {
        // An open to-do or an unchecked daily has nothing to uncheck (and a
        // checked to-do is no longer listed).
        throw new Error(pick(ACTION_TEXT.notChecked, this.language));
      }
      if (late) {
        await client.cron();
        logger.info('New Habitica day started from Gladys before checking a task');
        // The cron unchecked the dailies of yesterday.
        task = { ...task, completed: false };
      }
      if (task.type !== TASK_TYPES.HABIT && direction === 'up' && task.completed) {
        this.poll().catch(() => {});
        throw new Error(pick(ACTION_TEXT.alreadyDone, this.language));
      }
      if (task.type === TASK_TYPES.DAILY && direction === 'up' && !task.isDue) {
        throw new Error(pick(ACTION_TEXT.notDue, this.language));
      }
      stats = await client.score(task.id, direction);
    } catch (err) {
      if (err instanceof HabiticaError && err.status === 401 && err.code === 'NotAuthorized') {
        // "Your session is outdated": already checked (or unchecked) meanwhile.
        this.poll().catch(() => {});
        const key = direction === 'down' ? 'notChecked' : 'alreadyDone';
        throw new Error(pick(ACTION_TEXT[key], this.language), { cause: err });
      }
      throw this.explain(err);
    }
    logger.info(`Habitica ${task.type} scored ${direction} from Gladys`);
    await this.refreshSoon();
    return { task, direction, stats: stats ?? {} };
  }

  /** Create a to-do. */
  createTodo(title) {
    return this.serial(async () => {
      const client = this.requireClient();
      const wanted = String(title ?? '').trim();
      if (!wanted) {
        throw new Error(pick(ACTION_TEXT.emptyTitle, this.language));
      }
      let created;
      try {
        created = await client.createTodo(wanted.slice(0, 250));
      } catch (err) {
        throw this.explain(err);
      }
      logger.info('Habitica to-do created from Gladys');
      await this.refreshSoon();
      return { id: created?.id ?? '', title: created?.text ?? wanted };
    });
  }

  /** Start the new Habitica day now (its "cron"), as the apps do when opened. */
  startDay() {
    return this.serial(async () => {
      const client = this.requireClient();
      try {
        await client.cron();
      } catch (err) {
        throw this.explain(err);
      }
      logger.info('Habitica day started from Gladys');
      await this.refreshSoon();
      return { started: true };
    });
  }

  /** The dailies left, the overdue to-dos and the health, as a sentence. */
  async today() {
    this.requireClient();
    await this.poll();
    if (this.error) {
      throw this.explain(new HabiticaError(this.error.kind, this.error.message));
    }
    if (!this.user) {
      // The configuration changed during the reading.
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    const summary = this.summary();
    const texts = TODAY_TEXT[this.language] ?? TODAY_TEXT.en;
    const titles = summary.left.slice(0, MAX_TITLES).map((task) => task.title);
    const more = summary.left.length - titles.length;
    if (more > 0) {
      titles.push(`+${more}`);
    }
    const health = healthOf(this.user);
    const text =
      (summary.dailies === 0
        ? texts.noDailies
        : summary.dailiesLeft === 0
          ? texts.none
          : texts.list(summary.dailiesLeft, titles)) +
      (summary.todosOverdue > 0 ? texts.overdue(summary.todosOverdue) : '') +
      texts.health(health, this.user.level);
    return {
      text: text.slice(0, 1000),
      dailies_left: summary.dailiesLeft,
      todos_overdue: summary.todosOverdue,
      health,
      level: this.user.level,
    };
  }

  /** The toast of a command, in the four languages. */
  static doneMessage(title, kind = 'up') {
    return allLanguages((language) => DONE_TEXT[language][kind](title).slice(0, 200));
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    if (!this.user) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    const left = this.summary().dailiesLeft;
    return allLanguages((language) =>
      REPORT_TEXT[language].ok(this.user.name, this.user.level, left),
    );
  }
}
