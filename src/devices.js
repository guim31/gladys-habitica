// -----------------------------------------------------------------------------
// Gladys device: one "Habitica <name>" device for the character of the account.
//
// Identity: `character` / `user-<id>`, the user id Habitica gives the account
// (a UUID, never the name): renaming the character keeps its device.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js),
// all counter-sensor/integer, definitions in src/habitica/model.js:
//   - health (0 to 50), level, experience, gold (rounded down, as Habitica
//     shows them);
//   - dailies left today, overdue to-dos.
//
// The device is published with should_poll: false: the integration reads
// Habitica on its own timer (src/hub.js), every 5 to 30 minutes.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { MAX_HEALTH } from './habitica/model.js';

export const CHARACTER_TYPE = 'character';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  HEALTH: 'health',
  LEVEL: 'level',
  EXPERIENCE: 'experience',
  GOLD: 'gold',
  DAILIES_LEFT: 'dailies_left',
  TODOS_OVERDUE: 'todos_overdue',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.HEALTH]: 'Health',
    [FEATURE_KEYS.LEVEL]: 'Level',
    [FEATURE_KEYS.EXPERIENCE]: 'Experience',
    [FEATURE_KEYS.GOLD]: 'Gold',
    [FEATURE_KEYS.DAILIES_LEFT]: 'Dailies left',
    [FEATURE_KEYS.TODOS_OVERDUE]: 'Overdue to-dos',
  },
  fr: {
    [FEATURE_KEYS.HEALTH]: 'Points de vie',
    [FEATURE_KEYS.LEVEL]: 'Niveau',
    [FEATURE_KEYS.EXPERIENCE]: 'Expérience',
    [FEATURE_KEYS.GOLD]: 'Or',
    [FEATURE_KEYS.DAILIES_LEFT]: 'Quotidiennes restantes',
    [FEATURE_KEYS.TODOS_OVERDUE]: 'À faire en retard',
  },
  de: {
    [FEATURE_KEYS.HEALTH]: 'Lebenspunkte',
    [FEATURE_KEYS.LEVEL]: 'Stufe',
    [FEATURE_KEYS.EXPERIENCE]: 'Erfahrung',
    [FEATURE_KEYS.GOLD]: 'Gold',
    [FEATURE_KEYS.DAILIES_LEFT]: 'Offene Tägliche',
    [FEATURE_KEYS.TODOS_OVERDUE]: 'Überfällige To-dos',
  },
  es: {
    [FEATURE_KEYS.HEALTH]: 'Salud',
    [FEATURE_KEYS.LEVEL]: 'Nivel',
    [FEATURE_KEYS.EXPERIENCE]: 'Experiencia',
    [FEATURE_KEYS.GOLD]: 'Oro',
    [FEATURE_KEYS.DAILIES_LEFT]: 'Diarias pendientes',
    [FEATURE_KEYS.TODOS_OVERDUE]: 'Pendientes atrasados',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000;

const counter = (key, max, value, history = true) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: history,
    min: 0,
    max,
  },
  value,
});

const floor = (value) => Math.max(0, Math.floor(value));

// Order = display order in Gladys.
const FEATURES = [
  // Habitica shows health rounded up: 0.3 point left is still alive.
  counter(FEATURE_KEYS.HEALTH, MAX_HEALTH, ({ user }) =>
    Math.min(MAX_HEALTH, Math.max(0, Math.ceil(user.health))),
  ),
  counter(FEATURE_KEYS.LEVEL, 9999, ({ user }) => floor(user.level)),
  counter(FEATURE_KEYS.EXPERIENCE, COUNTER_MAX, ({ user }) => floor(user.experience)),
  counter(FEATURE_KEYS.GOLD, COUNTER_MAX, ({ user }) => floor(user.gold)),
  counter(FEATURE_KEYS.DAILIES_LEFT, 1000, ({ summary }) => summary.dailiesLeft),
  counter(FEATURE_KEYS.TODOS_OVERDUE, 10000, ({ summary }) => summary.todosOverdue),
];

export const characterIds = (gladys, userId) =>
  gladys.externalIds(CHARACTER_TYPE, `user-${userId}`);

export const characterName = (user) => `Habitica ${user.name}`.slice(0, 60);

export function buildCharacter(gladys, user, language = 'en') {
  const ids = characterIds(gladys, user.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: characterName(user),
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of every feature, in the `publishStates` format.
 * @param {{ user: object, summary: object }} reading
 */
export function featureStates(gladys, reading) {
  const ids = characterIds(gladys, reading.user.id);
  return FEATURES.map(({ key, value }) => ({
    device_feature_external_id: ids.feature(key),
    state: value(reading),
  }));
}
