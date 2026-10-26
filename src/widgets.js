// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `dailies_today`.
//
// The use case: the kitchen tablet shows the dailies left today, and a tap
// checks one without opening Habitica.
//
// Budget (8 components, 2 texts): two tiles (dailies left, health), one
// status list (the dailies left, then the overdue to-dos) and a "check"
// button for each of the first four dailies left. Before the new Habitica day
// has started, a "Start my day" button instead: a check would otherwise land
// on yesterday's dailies. The figures are values, not bound to device
// features, so the widget works before the device is added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { HabiticaHub, WIDGET_KEY } from './hub.js';
import { dueDate } from './habitica/model.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const CHECK_ACTIONS = ['check_1', 'check_2', 'check_3', 'check_4'];
export const START_DAY_ACTION = 'start_day';
const MAX_ROWS = 10;

export const TEXT = {
  configure: {
    en: 'Enter your Habitica user id and API token in the configuration of the integration.',
    fr: "Saisissez votre identifiant utilisateur et votre jeton d'API Habitica dans la configuration de l'intégration.",
    de: 'Gib deine Habitica-Benutzer-ID und dein API-Token in der Konfiguration der Integration ein.',
    es: 'Introduzca su ID de usuario y su token de API de Habitica en la configuración de la integración.',
  },
  noAnswer: {
    en: 'Habitica does not answer: see the Configuration screen of the integration.',
    fr: "Habitica ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Habitica antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Habitica no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Habitica does not answer: last known dailies.',
    fr: 'Habitica ne répond pas : dernières quotidiennes connues.',
    de: 'Habitica antwortet nicht: zuletzt bekannte Tägliche.',
    es: 'Habitica no responde: últimas diarias conocidas.',
  },
  newDay: {
    en: 'New day not started in Habitica yet.',
    fr: 'Nouvelle journée pas encore commencée dans Habitica.',
    de: 'Neuer Tag in Habitica noch nicht begonnen.',
    es: 'Nuevo día aún no empezado en Habitica.',
  },
  nothing: {
    en: 'Every daily is done today.',
    fr: "Toutes les quotidiennes sont faites aujourd'hui.",
    de: 'Heute sind alle Täglichen erledigt.',
    es: 'Todas las diarias están hechas hoy.',
  },
  noDailies: {
    en: 'No daily due today.',
    fr: "Aucune quotidienne à faire aujourd'hui.",
    de: 'Heute ist keine Tägliche fällig.',
    es: 'Hoy no toca ninguna diaria.',
  },
  dailiesLeft: { en: 'Dailies left', fr: 'Quotidiennes', de: 'Offene Tägliche', es: 'Diarias' },
  health: { en: 'Health', fr: 'Points de vie', de: 'Lebenspunkte', es: 'Salud' },
  daily: { en: 'Daily', fr: 'Quotidienne', de: 'Tägliche', es: 'Diaria' },
  overdue: { en: 'Overdue to-do', fr: 'À faire en retard', de: 'To-do überfällig', es: 'Atrasado' },
  startDay: {
    en: 'Start my day',
    fr: 'Commencer ma journée',
    de: 'Meinen Tag beginnen',
    es: 'Empezar mi día',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function overdueRow(hub, task, language) {
  const [year, month, day] = dueDate(task.dueAt, hub.timeZone).split('-').map(Number);
  const date = new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return {
    label: fit(task.title, 40),
    icon: 'alert-circle',
    value: fit(`${t(TEXT.overdue, language)} · ${date}`, 40),
    color: WIDGET_COLORS.DANGER,
  };
}

async function get(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (!hub.user) {
    return message(TEXT.noAnswer, language);
  }
  const summary = hub.summary();
  const health = Math.max(0, Math.ceil(hub.user.health));
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  } else if (hub.needsCron) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.newDay, language) });
  }
  components.push(
    {
      type: 'value',
      value: summary.dailiesLeft,
      label: t(TEXT.dailiesLeft, language),
      icon: 'check-square',
      color: summary.dailiesLeft === 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: health,
      unit: '/50',
      label: t(TEXT.health, language),
      icon: 'heart',
      color: health < hub.config.healthThreshold ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
  );
  const rows = [
    ...summary.left.map((task) => ({
      label: fit(task.title, 40),
      icon: 'square',
      value: t(TEXT.daily, language),
      color: WIDGET_COLORS.WARNING,
    })),
    ...summary.overdue.map((task) => overdueRow(hub, task, language)),
  ].slice(0, MAX_ROWS);
  if (summary.dailiesLeft === 0 && components.length < 3) {
    const text = summary.dailies === 0 ? TEXT.noDailies : TEXT.nothing;
    components.push({ type: 'text', variant: 'body', text: t(text, language) });
  }
  if (rows.length > 0) {
    components.push({ type: 'status', items: rows });
  }
  if (!hub.error) {
    if (hub.needsCron) {
      components.push({
        type: 'button',
        label: t(TEXT.startDay, language),
        icon: 'sunrise',
        style: 'secondary',
        action: { key: START_DAY_ACTION },
      });
    } else {
      summary.left.slice(0, CHECK_ACTIONS.length).forEach((task, index) => {
        components.push({
          type: 'button',
          label: fit(task.title, 24),
          icon: 'check',
          style: 'secondary',
          action: { key: CHECK_ACTIONS[index], params: { id: task.id } },
        });
      });
    }
  }
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (actionKey === START_DAY_ACTION) {
    await hub.startDay();
    return { message: HabiticaHub.doneMessage('', 'dayStarted') };
  }
  if (!CHECK_ACTIONS.includes(actionKey) || typeof params.id !== 'string' || !params.id) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const { task } = await hub.score(params.id, { direction: 'up', type: 'daily' });
  return { message: HabiticaHub.doneMessage(task.title) };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
