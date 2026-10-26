// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Habitica account (its user id and API token), on habitica.com or on a
// self-hosted server, read on a timer of the container.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_URL = 'https://habitica.com';

// Refresh intervals offered in the configuration, in seconds. Five minutes at
// the most often: habitica.com asks tools to stay well below 30 requests a minute.
export const POLL_INTERVALS = ['300', '600', '900', '1800'];

// Hours before the end of the Habitica day for the "daily still to do" event.
export const REMINDER_HOURS = ['1', '2', '3', '4', '6', '8'];

export const DEFAULT_CONFIG = {
  url: DEFAULT_URL,
  user_id: '',
  api_token: '',
  allow_self_signed: false,
  health_threshold: 15,
  reminder_hours: '2',
  poll_interval: '300',
  language: 'fr',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:3000`), or the URL copied from the browser
 * (`https://habitica.com/today`). HTTPS for habitica.com, HTTP otherwise by
 * default. A path prefix is kept (reverse proxy under `/habitica`), the API
 * path and the known screens of the web app are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return DEFAULT_URL;
  }
  const bareHabitica = /^(www\.)?habitica\.com(\/|$)/i.test(text);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `${bareHabitica ? 'https' : 'http'}://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  if (/^(www\.)?habitica\.com$/i.test(url.hostname)) {
    return DEFAULT_URL;
  }
  const path = url.pathname
    .replace(/\/api(\/.*)?$/, '')
    .replace(
      /\/(today|tasks|user|inventory|shops|party|groups|challenges|login|static)(\/.*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/** habitica.com is a cloud service; any other address is the user's own server. */
export const isCloud = (url) => url === DEFAULT_URL;

const bool = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const userId = typeof source.user_id === 'string' ? source.user_id.trim().toLowerCase() : '';
  const poll = String(source.poll_interval ?? '');
  const hours = String(source.reminder_hours ?? '');
  const threshold = Number.parseInt(String(source.health_threshold ?? ''), 10);
  return {
    url: parseServerUrl(typeof source.url === 'string' ? source.url : ''),
    userId: UUID.test(userId) ? userId : '',
    userIdTyped: userId !== '',
    // Tokens are kept as typed, minus the blanks a copy and paste adds around them.
    token: typeof source.api_token === 'string' ? source.api_token.trim() : '',
    allowSelfSigned: bool(source.allow_self_signed),
    healthThreshold:
      Number.isFinite(threshold) && threshold >= 0 && threshold <= 50
        ? threshold
        : DEFAULT_CONFIG.health_threshold,
    reminderHours: Number(REMINDER_HOURS.includes(hours) ? hours : DEFAULT_CONFIG.reminder_hours),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
