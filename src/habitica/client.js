// -----------------------------------------------------------------------------
// Habitica API client: the calls the integration needs, on `/api/v3`,
// authenticated by the user id and the API token of the account (Settings →
// Site Data → API) in the `x-api-user` and `x-api-key` headers. Habitica asks
// every third-party tool for an `x-client` header, `<user id>-<tool name>`.
// Checked against a real self-hosted Habitica 5.51.0 in Docker, October 2026.
//
//   GET  /api/v3/status                    { status: 'up' } (no credentials)
//   GET  /api/v3/user?userFields=…         the character (stats, preferences…)
//   GET  /api/v3/tasks/user?dueDate=…      habits, dailies, open to-dos, rewards
//   POST /api/v3/tasks/:id/score/up|down   check a task, or a habit + / −
//   POST /api/v3/tasks/user                create a task (a to-do here)
//   POST /api/v3/cron                      start the new day
//
// Pitfalls found on the real server:
//   - Answers are `{ success, data }`; errors `{ success: false, error,
//     message }`, `error` being a class name (`NotAuthorized`, `NotFound`…).
//   - Checking a daily or a to-do already checked answers **401**
//     `NotAuthorized` "Your session is outdated": not a credentials problem.
//     Wrong credentials answer 401 `invalid_credentials`.
//   - Reading never runs the "cron" (the end of the day: dailies unchecked,
//     damage): the official apps call POST /cron when the user opens them.
//     Until then the dailies keep yesterday's checks; `isDue` is computed for
//     the moment given in `dueDate`, so the dailies of today are right.
//   - With `userFields`, `needsCron` and the computed stats (`maxHealth`,
//     `toNextLevel`) are left out; without, the answer holds the whole
//     account (inventory, inbox…), hundreds of kilobytes for an old account.
//   - habitica.com allows 30 requests per minute (`X-RateLimit-*` headers,
//     429 with `Retry-After` beyond); a self-hosted server usually none.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // wrong user id or API token
  NOT_HABITICA: 'not_habitica', // something answers, but not the Habitica API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: the server's request limit
  HTTP: 'http', // any other unexpected answer
});

export class HabiticaError extends Error {
  constructor(kind, message, status, code, retryAfterMs) {
    super(message);
    this.name = 'HabiticaError';
    this.kind = kind;
    this.status = status;
    /** Habitica's own error class (`error` of the JSON answer), e.g. NotFound. */
    this.code = code;
    /** For a 429: how long the server asks to wait. */
    this.retryAfterMs = retryAfterMs;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// The fields of the character the integration reads.
const USER_FIELDS = [
  'stats',
  'preferences.dayStart',
  'preferences.timezoneOffset',
  'preferences.sleep',
  'profile.name',
  'auth.local.username',
  'lastCron',
].join(',');

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new HabiticaError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new HabiticaError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

function retryAfter(headers) {
  const seconds = Number.parseInt(headers['retry-after'], 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const reset = Date.parse(headers['x-ratelimit-reset']);
  return Number.isFinite(reset) ? Math.max(0, reset - Date.now()) : undefined;
}

/**
 * The moment to compute the dailies for. Habitica reads a time of exactly
 * 00:00:00.000 as "a date only" and moves it to the user's day start: nudge it.
 */
export function dueDateParam(now) {
  const date = new Date(now);
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
    date.setUTCSeconds(1);
  }
  return date.toISOString();
}

export class HabiticaClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.userId user id of the account
   * @param {string} options.token API token of the account
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/habitica/http.js)
   */
  constructor({ url, userId, token, insecure = false, request = httpRequest }) {
    this.url = url;
    this.userId = userId;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
  }

  async call(path, { method = 'GET', json, auth = true } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}/api/v3${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: {
          'x-client': `${this.userId}-gladys`,
          ...(auth ? { 'x-api-user': this.userId, 'x-api-key': this.token } : {}),
        },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body, headers = {} } = response;
    let parsed;
    let parsedOk = true;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsedOk = false;
    }
    // The server's own message, short; it never echoes the token.
    const said =
      parsedOk && typeof parsed?.message === 'string' ? ` ${parsed.message.slice(0, 200)}` : '';
    const code = parsedOk && typeof parsed?.error === 'string' ? parsed.error : undefined;
    if (status === 429) {
      throw new HabiticaError(
        ERROR_KINDS.RATE_LIMIT,
        'HTTP 429',
        status,
        code,
        retryAfter(headers),
      );
    }
    if (status === 401 && code === 'NotAuthorized') {
      // A refusal of the operation itself (a daily already checked, not
      // enough gold), the credentials being fine.
      throw new HabiticaError(ERROR_KINDS.HTTP, `HTTP 401${said}`, status, code);
    }
    if (status === 401 || status === 403) {
      throw new HabiticaError(ERROR_KINDS.AUTH, `HTTP ${status}${said}`, status, code);
    }
    if (status >= 300 && status < 400) {
      throw new HabiticaError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (!parsedOk || !parsed || typeof parsed !== 'object' || !('success' in parsed)) {
      throw new HabiticaError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_HABITICA : ERROR_KINDS.HTTP,
        `HTTP ${status}, not the Habitica API`,
        status,
      );
    }
    if (status < 200 || status >= 300 || parsed.success !== true) {
      throw new HabiticaError(ERROR_KINDS.HTTP, `HTTP ${status}${said}`, status, code);
    }
    return parsed.data;
  }

  /** `{ status }`, without credentials; throws NOT_HABITICA elsewhere. */
  async status() {
    let data;
    try {
      data = await this.call('/status', { auth: false });
    } catch (err) {
      if (err instanceof HabiticaError && err.status === 404) {
        throw new HabiticaError(ERROR_KINDS.NOT_HABITICA, 'no /api/v3/status', 404);
      }
      throw err;
    }
    if (!data || typeof data.status !== 'string') {
      throw new HabiticaError(ERROR_KINDS.NOT_HABITICA, 'no status in /status', 200);
    }
    return data;
  }

  async user() {
    return this.call(`/user?${new URLSearchParams({ userFields: USER_FIELDS })}`);
  }

  /** Habits, dailies (`isDue` computed for `now`), open to-dos and rewards. */
  async tasks(now = Date.now()) {
    const data = await this.call(
      `/tasks/user?${new URLSearchParams({ dueDate: dueDateParam(now) })}`,
    );
    return Array.isArray(data) ? data : [];
  }

  /**
   * Check a task (`up`), or uncheck it / score a habit − (`down`).
   * @returns {Promise<object>} the new stats: hp, mp, exp, gp, lvl…
   */
  async score(id, direction) {
    return this.call(
      `/tasks/${encodeURIComponent(id)}/score/${direction === 'down' ? 'down' : 'up'}`,
      { method: 'POST' },
    );
  }

  async createTodo(text) {
    return this.call('/tasks/user', { method: 'POST', json: { type: 'todo', text } });
  }

  /** Start the new day (what the apps do when opened). */
  async cron() {
    return this.call('/cron', { method: 'POST' });
  }
}
