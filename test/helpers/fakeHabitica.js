// -----------------------------------------------------------------------------
// An in-memory Habitica, answering the routes the integration calls the way
// the real server does (`{ success, data }` answers, `{ success: false,
// error, message }` errors, 401 `invalid_credentials` for wrong credentials,
// 401 `NotAuthorized` "session outdated" for a daily already checked, the web
// app's HTML page outside /api). Its starting data are real answers of a
// self-hosted Habitica 5.51.0 in Docker (October 2026,
// test/fixtures/habitica/real-*.json): a level 1 warrior, two habits, three
// dailies (one checked, one left, one due on Thursdays only), two to-dos (one
// overdue since 20/10) and a reward.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/habitica/${name}.json`, import.meta.url), 'utf8'));

export const USER_ID = 'fe288c5d-45f8-4612-b581-53b4f5af2f18';
export const TOKEN = '2cc91bb8-1d93-4a3c-b29e-79ad82a002a6';

const json = (status, value, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(value),
});
const fail = (status, error, message, headers) =>
  json(status, { success: false, error, message }, headers);
const ok = (data, status = 200) => json(status, { success: true, data });

export class FakeHabitica {
  constructor({ now = () => Date.now(), userId = USER_ID, token = TOKEN } = {}) {
    this.now = now;
    this.userId = userId;
    this.token = token;
    this.user = structuredClone(fixture('real-user').data);
    this.tasks = structuredClone(fixture('real-tasks').data);
    this.online = true;
    this.rateLimited = false;
    this.requests = [];
    this.nextId = 1;
  }

  task(title) {
    return this.tasks.find((task) => task.text === title);
  }

  get stats() {
    return this.user.stats;
  }

  gain(exp, gp) {
    this.stats.exp += exp;
    this.stats.gp += gp;
    while (this.stats.exp >= 25 * this.stats.lvl) {
      this.stats.exp -= 25 * this.stats.lvl;
      this.stats.lvl += 1;
    }
  }

  score(task, direction) {
    if (task.type === 'daily' || task.type === 'todo') {
      if (task.completed === (direction === 'up')) {
        return fail(401, 'NotAuthorized', 'Your session is outdated. Please refresh or sync.');
      }
      task.completed = direction === 'up';
    }
    if (direction === 'up') {
      this.gain(10, 1);
    } else {
      this.stats.hp = Math.max(0, this.stats.hp - 2);
    }
    return ok({ delta: 1, ...structuredClone(this.stats), _tmp: {} });
  }

  cron() {
    for (const task of this.tasks) {
      if (task.type === 'daily') {
        if (task.isDue && !task.completed) {
          this.stats.hp = Math.max(0, this.stats.hp - 5);
        }
        task.completed = false;
      }
    }
    this.tasks = this.tasks.filter((task) => !(task.type === 'todo' && task.completed));
    this.user.lastCron = new Date(this.now()).toISOString();
    return ok({});
  }

  /** The `request` seam of src/habitica/http.js. */
  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({ method, path: pathname, search: searchParams.toString(), headers });
    if (!pathname.startsWith('/api/v3/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!DOCTYPE html>' };
    }
    const route = pathname.slice('/api/v3'.length);
    if (route === '/status') {
      return ok({ status: 'up' });
    }
    if (this.rateLimited) {
      return fail(429, 'TooManyRequests', 'Too many requests.', { 'retry-after': '40' });
    }
    if (headers['x-api-user'] !== this.userId || headers['x-api-key'] !== this.token) {
      return fail(401, 'invalid_credentials', 'There is no account that uses those credentials.');
    }
    if (route === '/user' && method === 'GET') {
      return ok(structuredClone(this.user));
    }
    if (route === '/tasks/user' && method === 'GET') {
      return ok(structuredClone(this.tasks.filter((t) => !(t.type === 'todo' && t.completed))));
    }
    if (route === '/tasks/user' && method === 'POST') {
      const created = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
        type: body.type,
        text: body.text,
        completed: false,
        date: null,
      };
      created._id = created.id;
      this.tasks.push(created);
      return ok(created, 201);
    }
    if (route === '/cron' && method === 'POST') {
      return this.cron();
    }
    const scoring = route.match(/^\/tasks\/([^/]+)\/score\/(up|down)$/);
    if (scoring && method === 'POST') {
      const task = this.tasks.find((t) => t.id === decodeURIComponent(scoring[1]));
      if (!task) {
        return fail(404, 'NotFound', 'Task not found.');
      }
      return this.score(task, scoring[2]);
    }
    return fail(404, 'NotFound', 'Not found.');
  }
}

/** A fake network: base URL → server; anything else does not answer. */
export function createNetwork(servers) {
  return {
    async request(url, options) {
      for (const [base, server] of Object.entries(servers)) {
        if (url.startsWith(`${base}/`)) {
          if (!server.online) {
            const error = new Error('connect ECONNREFUSED');
            error.code = 'ECONNREFUSED';
            throw error;
          }
          return server.handle(url, options);
        }
      }
      const error = new Error('getaddrinfo ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    },
  };
}
