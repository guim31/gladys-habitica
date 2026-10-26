// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors and results. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// Habitica's own words follow its translations: Dailies / Quotidiennes /
// Tägliche / Diarias, To-dos / À faire / To-dos / Pendientes.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './habitica/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  invalidUrl: {
    en: 'Address not understood, e.g. https://habitica.com',
    fr: 'Adresse incomprise, ex. https://habitica.com',
    de: 'Adresse nicht verstanden, z. B. https://habitica.com',
    es: 'Dirección no válida, p. ej. https://habitica.com',
  },
  noUserId: {
    en: 'Enter your Habitica user id in the configuration (Settings, Site Data, API).',
    fr: 'Saisissez votre identifiant utilisateur Habitica dans la configuration (Paramètres, Données du site, API).',
    de: 'Gib in der Konfiguration deine Habitica-Benutzer-ID ein (Einstellungen, Seitendaten, API).',
    es: 'Introduzca su ID de usuario de Habitica en la configuración (Ajustes, Datos del sitio, API).',
  },
  invalidUserId: {
    en: 'The user id is a code like 01234567-89ab-cdef-0123-456789abcdef.',
    fr: "L'identifiant utilisateur est un code comme 01234567-89ab-cdef-0123-456789abcdef.",
    de: 'Die Benutzer-ID ist ein Code wie 01234567-89ab-cdef-0123-456789abcdef.',
    es: 'El ID de usuario es un código como 01234567-89ab-cdef-0123-456789abcdef.',
  },
  noToken: {
    en: 'Enter your Habitica API token in the configuration (Settings, Site Data, API).',
    fr: "Saisissez votre jeton d'API Habitica dans la configuration (Paramètres, Données du site, API).",
    de: 'Gib in der Konfiguration dein Habitica-API-Token ein (Einstellungen, Seitendaten, API).',
    es: 'Introduzca su token de API de Habitica en la configuración (Ajustes, Datos del sitio, API).',
  },
};

// One short explanation per error kind (src/habitica/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Habitica does not answer',
    fr: 'Habitica ne répond pas',
    de: 'Habitica antwortet nicht',
    es: 'Habitica no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'user id or API token refused',
    fr: "identifiant utilisateur ou jeton d'API refusé",
    de: 'Benutzer-ID oder API-Token abgelehnt',
    es: 'ID de usuario o token de API rechazado',
  },
  [ERROR_KINDS.NOT_HABITICA]: {
    en: 'no Habitica API at this address',
    fr: 'aucune API Habitica à cette adresse',
    de: 'keine Habitica-API unter dieser Adresse',
    es: 'no hay ninguna API de Habitica en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (name, level, left) =>
      `Habitica OK: ${name}, level ${level}, ${left} daily(ies) left today.`,
    failed: (reason) => `Habitica: ${reason}.`,
  },
  fr: {
    ok: (name, level, left) =>
      `Habitica OK : ${name}, niveau ${level}, ${left} quotidienne(s) restante(s) aujourd'hui.`,
    failed: (reason) => `Habitica : ${reason}.`,
  },
  de: {
    ok: (name, level, left) =>
      `Habitica OK: ${name}, Stufe ${level}, heute ${left} offene Tägliche.`,
    failed: (reason) => `Habitica: ${reason}.`,
  },
  es: {
    ok: (name, level, left) =>
      `Habitica OK: ${name}, nivel ${level}, ${left} diaria(s) pendiente(s) hoy.`,
    failed: (reason) => `Habitica: ${reason}.`,
  },
};

// Errors of the scene actions and the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Habitica is not configured.',
    fr: "Habitica n'est pas configuré.",
    de: 'Habitica ist nicht konfiguriert.',
    es: 'Habitica no está configurado.',
  },
  emptyTask: {
    en: 'Give the title of the task.',
    fr: 'Indiquez le titre de la tâche.',
    de: 'Gib den Titel der Aufgabe an.',
    es: 'Indique el título de la tarea.',
  },
  taskNotFound: {
    en: 'No habit, daily or open to-do has this title in Habitica.',
    fr: 'Aucune habitude, quotidienne ou tâche à faire ouverte ne porte ce titre dans Habitica.',
    de: 'Keine Gewohnheit, Tägliche oder offenes To-do hat diesen Titel in Habitica.',
    es: 'Ningún hábito, diaria o pendiente abierto tiene este título en Habitica.',
  },
  taskAmbiguous: {
    en: 'Several tasks have this title: rename one in Habitica, or give its id.',
    fr: 'Plusieurs tâches portent ce titre : renommez-en une dans Habitica, ou indiquez son identifiant.',
    de: 'Mehrere Aufgaben haben diesen Titel: Benenne eine in Habitica um oder gib ihre ID an.',
    es: 'Varias tareas tienen este título: cambie el nombre de una en Habitica o indique su ID.',
  },
  emptyTitle: {
    en: 'Give the title of the new to-do.',
    fr: 'Indiquez le titre de la nouvelle tâche à faire.',
    de: 'Gib den Titel des neuen To-dos an.',
    es: 'Indique el título del nuevo pendiente.',
  },
  alreadyDone: {
    en: 'This task is already checked: the list is refreshed.',
    fr: 'Cette tâche est déjà cochée : la liste est mise à jour.',
    de: 'Diese Aufgabe ist schon abgehakt: Die Liste wird aktualisiert.',
    es: 'Esta tarea ya está marcada: la lista se actualiza.',
  },
  notDue: {
    en: 'This daily is not due today.',
    fr: "Cette quotidienne n'est pas à faire aujourd'hui.",
    de: 'Diese Tägliche ist heute nicht fällig.',
    es: 'Esta diaria no toca hoy.',
  },
};

// Toasts and scene results (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    up: (title) => `"${title}" checked.`,
    down: (title) => `"${title}": minus scored.`,
    created: (title) => `"${title}" added.`,
    dayStarted: () => 'New Habitica day started.',
  },
  fr: {
    up: (title) => `« ${title} » cochée.`,
    down: (title) => `« ${title} » : moins compté.`,
    created: (title) => `« ${title} » ajoutée.`,
    dayStarted: () => 'Nouvelle journée Habitica commencée.',
  },
  de: {
    up: (title) => `„${title}“ abgehakt.`,
    down: (title) => `„${title}“: Minus gezählt.`,
    created: (title) => `„${title}“ hinzugefügt.`,
    dayStarted: () => 'Neuer Habitica-Tag begonnen.',
  },
  es: {
    up: (title) => `«${title}» marcada.`,
    down: (title) => `«${title}»: menos contado.`,
    created: (title) => `«${title}» añadida.`,
    dayStarted: () => 'Nuevo día de Habitica empezado.',
  },
};

// The sentence of the "Read Habitica" scene action, for a message or a voice
// announcement.
const join = (titles, and) =>
  titles.length < 2 ? titles.join('') : `${titles.slice(0, -1).join(', ')} ${and} ${titles.at(-1)}`;

export const TODAY_TEXT = {
  en: {
    none: 'Every daily is done today.',
    list: (count, titles) => `${count} daily(ies) left today: ${join(titles, 'and')}.`,
    overdue: (count) => ` ${count} overdue to-do(s).`,
    health: (health, level) => ` Health ${health}/50, level ${level}.`,
  },
  fr: {
    none: "Toutes les quotidiennes sont faites aujourd'hui.",
    list: (count, titles) =>
      `${count} quotidienne(s) restante(s) aujourd'hui : ${join(titles, 'et')}.`,
    overdue: (count) => ` ${count} tâche(s) à faire en retard.`,
    health: (health, level) => ` Points de vie ${health}/50, niveau ${level}.`,
  },
  de: {
    none: 'Heute sind alle Täglichen erledigt.',
    list: (count, titles) => `Heute noch ${count} Tägliche: ${join(titles, 'und')}.`,
    overdue: (count) => ` ${count} überfällige(s) To-do(s).`,
    health: (health, level) => ` Lebenspunkte ${health}/50, Stufe ${level}.`,
  },
  es: {
    none: 'Todas las diarias están hechas hoy.',
    list: (count, titles) => `${count} diaria(s) pendiente(s) hoy: ${join(titles, 'y')}.`,
    overdue: (count) => ` ${count} pendiente(s) atrasado(s).`,
    health: (health, level) => ` Salud ${health}/50, nivel ${level}.`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
