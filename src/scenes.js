// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The fields
// are strings, so a scene variable fits too (`{{triggerEvent.data.task_id}}`).
//
//   - `score_task`: check a habit (+ or −), a daily or a to-do by its title
//     (an NFC tag on the water bottle, a voice command, a sensor);
//   - `create_todo`: add a to-do ("buy bread" from a button);
//   - `start_day`: start the new Habitica day (its "cron"), e.g. at wake-up;
//   - `read_status`: the dailies left, overdue to-dos and health as a
//     sentence, for a message or a voice announcement.
// -----------------------------------------------------------------------------

export const DIRECTIONS = ['up', 'down'];

const round = (value) => (Number.isFinite(value) ? Math.floor(value) : 0);

export const SCENE_ACTIONS = {
  async score_task(hub, { fields = {} }) {
    // A select without a default arrives empty (Gladys#3155): "up".
    const direction = DIRECTIONS.includes(fields.direction) ? fields.direction : 'up';
    const { task, stats } = await hub.score(fields.task, { direction });
    return {
      task: task.title,
      task_type: task.type,
      health: Math.max(0, Math.ceil(Number(stats.hp) || 0)),
      level: round(stats.lvl),
      gold: round(stats.gp),
    };
  },

  async create_todo(hub, { fields = {} }) {
    const { id, title } = await hub.createTodo(fields.title);
    return { task: title, task_id: id };
  },

  async start_day(hub) {
    await hub.startDay();
    return {};
  },

  async read_status(hub) {
    return hub.today();
  },
};
