# Habitica for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings a [Habitica](https://habitica.com) character into Gladys, from
habitica.com or a self-hosted Habitica: health, level, experience, gold, the
dailies left today and the overdue to-dos, scene triggers on the dailies and
the character, and tasks checked from a scene or the dashboard.

> **Feedback welcome.** The integration was checked against a real
> self-hosted Habitica server (Habitica 5.51.0 in Docker, October 2026), but
> not yet in everyday use with a real Gladys, nor against habitica.com. Please
> report what works and what does not in the
> [issues](https://github.com/guim31/gladys-habitica/issues).

## Features

- **A "Habitica <name>" device** with six features: _health_ (0 to 50),
  _level_, _experience_, _gold_, _dailies left_ today and _overdue to-dos_.
- **Dashboard widget** "Habitica dailies": the dailies left and health as
  tiles, the dailies left and the overdue to-dos, and a button to check each of
  the first four dailies; "Start my day" instead when the new Habitica day has
  not started yet.
- **Scene triggers**: _Habitica daily still to do_ (1 to 8 hours before the end
  of the Habitica day), _Habitica level gained_, _Habitica health low_
  (threshold in the configuration) and _All Habitica dailies done_. Once each,
  across restarts.
- **Scene actions**: _Check a Habitica task_ (a habit + or −, a daily, a to-do,
  by title), _Create a Habitica to-do_, _Start the Habitica day_ and _Read
  Habitica_ (a sentence for a message or a voice announcement).
- The **Custom Day Start** of the account is followed, in the time zone of
  Gladys, and the reminder is on time whatever the refresh interval (5 to 30
  minutes).
- A **Test the connection** button, a connection status that names the
  problem, and a transport badge (cloud for habitica.com, local for a server of
  your own).
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A Habitica account, and its **User ID** and **API Token** (Habitica →
  Settings → Site Data → API). The integration acts as this account.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-habitica`
   (or install **Habitica** from the catalog once it is listed).
2. In **Configuration**, keep `https://habitica.com` or enter the address of
   your server, then the User ID and the API token. Save, then click **Test
   the connection**.
3. Open the **Discover** tab and add the device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the Habitica API v3 with the `x-api-user`, `x-api-key`
and `x-client` (`<user id>-gladys`) headers:

| Request                                 | Use                                            |
| --------------------------------------- | ---------------------------------------------- |
| `GET /api/v3/user?userFields=…`         | stats, Custom Day Start, last cron             |
| `GET /api/v3/tasks/user?dueDate=<now>`  | habits, dailies (`isDue` for now), open to-dos |
| `POST /api/v3/tasks/{id}/score/up/down` | check a task, a habit + or −                   |
| `POST /api/v3/tasks/user`               | create a to-do                                 |
| `POST /api/v3/cron`                     | start the new day                              |

Reading never runs Habitica's "cron" (the end of the day): until the user opens
Habitica, the dailies keep yesterday's checks, so the integration counts every
daily of the day as left, and starts the day before checking a task. Habitica
is read on a timer of the container (2 requests per reading, at most every 5
minutes: Habitica allows 30 requests per minute and asks tools to stay well
below); the device is published with `should_poll: false`. States are published
only when they change, and every 12 hours otherwise. The last level, health and
dailies left are kept in `/data/habitica-state.json` for the scene events.
Habitica webhooks are not used: they need an address Habitica can reach.

## Checked on a real Habitica, and what was not

Checked against a self-hosted Habitica 5.51.0 (image
`awinterstein/habitica-server`, with MongoDB 6 as a replica set) in a Docker
network: an account registered through the API, habits, dailies (one due on
Thursdays only), to-dos with due dates and a reward, checked through the API
and through the integration (widget button, double tap refused, habit + and −,
to-do created, day started). The real answers are in `test/fixtures/habitica/`
and drive the tests; the integration ran in its own container under the Gladys
sandbox limits (read-only root, no capabilities, 256 MB) against that server,
against the SDK's fake Gladys.

Not checked: a real Gladys instance, habitica.com itself (its rate limit
headers and 429 answers are handled from the documentation), group plan tasks.

## Limitations

- One account per installation; rewards and checklists are not handled.
- A change made in Habitica shows up within the refresh interval.
- The Habitica day uses the time zone of Gladys, not the one stored in the
  Habitica account.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Habitica (`test/helpers/fakeHabitica.js`) built from real
answers. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Habitica](https://habitica.com) by HabitRPG, Inc. and its contributors: the
  integration only talks to its API; no code was copied. The cover uses the
  Habitica logo from its
  [repository](https://github.com/HabitRPG/habitica)
  (`website/client/src/assets/svg/logo-horizontal.svg`), to name the service.
- The Home Assistant [Habitica integration](https://www.home-assistant.io/integrations/habitica/)
  (Apache-2.0) gave the list of useful features; no code was copied.
- The architecture and the conformity tests follow
  [gladys-vikunja](https://github.com/guim31/gladys-vikunja),
  [gladys-donetick](https://github.com/guim31/gladys-donetick) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by HabitRPG, Inc.
The Habitica name and logo belong to their owners.

## License

Apache-2.0
