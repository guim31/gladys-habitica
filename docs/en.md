# Habitica

Bring your [Habitica](https://habitica.com) character into Gladys: health,
level, experience, gold, the dailies left today and the overdue to-dos. A
scene reminds you of the dailies still unchecked in the evening, celebrates a
level gained or warns when health runs low; an NFC tag on the water bottle
scores a habit, a tap on the dashboard checks a daily, and Gladys can read out
what is left every evening.

Works with habitica.com and with a self-hosted Habitica.

> **Feedback welcome.** This integration was tested against a real
> self-hosted Habitica server (Habitica 5.51.0 in Docker, October 2026), not
> yet in everyday use, nor against habitica.com. If something does not work as
> described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-habitica/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Habitica account, on habitica.com or on your own server.
- Its **User ID** and **API Token**: in Habitica, **Settings** → **Site Data**
  → **API** (on the mobile app: **Settings** → **API**), then **Show API
  Token**. The token gives full access to the account: keep it to yourself,
  and reset it in the same place if it leaks.

## Set up

1. Install the integration from the store (**Integrations** → **Habitica**).
2. In **Configuration**:
   - **Address**: keep `https://habitica.com`, or enter the address of your
     own server (e.g. `http://192.168.1.20:3000`).
   - **User ID** and **API token**: copied from Habitica.
   - **Accept self-signed certificates**: only for an `https://` address of
     your own server with a self-signed certificate.
   - **Low health threshold** (15 by default, out of 50): the threshold of the
     "Habitica health low" event.
   - **Reminder of the dailies left**: how many hours before the end of the
     Habitica day the "Habitica daily still to do" event fires (2 by
     default).
   - **Refresh interval**: 5 minutes by default, up to 30.
   - **Language of the feature names**: the names given to the features
     when the device is added, and the sentences sent to scenes.
3. Use **Test the connection**: it shows your character's name, level and the
   dailies left today.
4. In **Discovery**, add the **Habitica <name>** device.

The Habitica day starts at the **Custom Day Start** hour of your account
(Settings → Site Data in Habitica), in the time zone of Gladys.

## Devices

One device, **Habitica <name of the character>**, with these features:

| Feature        | What it counts                                            |
| -------------- | --------------------------------------------------------- |
| Health         | health points, 0 to 50, rounded up as Habitica shows them |
| Level          | the level of the character                                |
| Experience     | experience points within the level                        |
| Gold           | gold, rounded down                                        |
| Dailies left   | dailies due today and not checked yet                     |
| Overdue to-dos | open to-dos whose due date is before today                |

Until you open Habitica on a new day (or use "Start the Habitica day"), the
new day has not started in Habitica: every daily of the day then counts as
left, since Habitica is about to uncheck them all.

The values follow the refresh interval, and every action from Gladys updates
them at once.

## Dashboard

The **Habitica dailies** widget shows the dailies left and your health, the
list of dailies left then the overdue to-dos, and a button to check each of
the first four dailies left. When the new day has not started yet in
Habitica, it says so and offers a **Start my day** button instead: a check
would otherwise count for yesterday.

## Scenes

### Triggers

- **Habitica daily still to do**: fires for each daily still unchecked, the
  set number of hours before the end of the Habitica day. Filter: the daily
  title (empty: any). Variables: the daily, its id, the number of dailies
  left, the hours before the end of the day.
- **Habitica level gained**: the character reached a new level. Variables:
  the level, the previous level, the class.
- **Habitica health low**: health fell below the threshold of the
  configuration. Fires once per crossing. Variables: health, threshold, level.
- **All Habitica dailies done**: the last daily of the day was just checked,
  in Habitica or from Gladys. Variable: the number of dailies of the day.

Events are detected at each reading: up to the refresh interval later for a
level, health or the last daily; the reminder is always on time.

### Actions

- **Check a Habitica task**: by its exact title (case and accents ignored) or
  its id: a habit + or −, a daily, a to-do. The direction "−" scores a bad
  habit, or unchecks a daily or a to-do. If the new day has not started yet in
  Habitica, it is started first. Outputs: the task, its type, health, level
  and gold after scoring.
- **Create a Habitica to-do**: adds a to-do to the account. Outputs: the to-do
  and its id.
- **Start the Habitica day**: what Habitica does when you open it on a new
  day: yesterday's missed dailies deal their damage, then every daily is
  unchecked.
- **Read Habitica**: the dailies left, the overdue to-dos and the health as
  one sentence, for a message or a voice announcement. Outputs: the sentence,
  the dailies left, the overdue to-dos, health and level.

### Scene ideas

- **Habitica daily still to do** (at 10 pm: 2 hours before midnight) → send
  "{{triggerEvent.data.task}} is still to do" on Telegram.
- An NFC tag on the water bottle → **Check a Habitica task** "Drink a glass of
  water".
- **All Habitica dailies done** → turn the living room light green for a
  minute.
- Every morning at 7 am → **Start the Habitica day**, then **Read Habitica**
  and say the sentence on the speaker.

## Troubleshooting

- **"user id or API token refused"**: copy them again from Settings → Site
  Data → API. A reset token must be entered again.
- **"Habitica does not answer"**: for your own server, check the address and
  the port, reachable from Gladys.
- **"no Habitica API at this address"**: the address points to something
  else, or misses a path prefix of your reverse proxy.
- **"too many requests"**: habitica.com allows 30 requests per minute per
  account, shared by every tool you use. The integration waits and tries
  again.
- **The dailies left look like yesterday's**: the new day has not started in
  Habitica yet; open Habitica or use "Start my day".
- More details with the log level `debug` in the integration settings.

## Limits

- One Habitica account per installation.
- Rewards are not shown nor bought, and the checklist items of a task are not
  shown.
- Two tasks with the same title cannot be told apart by title: use the task id
  (in Habitica, the task's edit screen) or rename one.
- The Habitica day uses the time zone of Gladys: if your Habitica account is
  set to another one, the start of the day and the reminder follow Gladys.
- Habitica's terms ask tools to stay well below 30 requests per minute: the
  integration reads 2 requests per refresh (5 minutes at the most often), plus
  about 5 per action.
- Not affiliated with HabitRPG, Inc.
