# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Habitica in Gladys, on habitica.com or a self-hosted server: a "Habitica
  <name>" device with health, level, experience, gold, the dailies left today
  and the overdue to-dos.
- Dashboard widget "Habitica dailies": the dailies left and the overdue
  to-dos, with a button to check each of the first four dailies, or "Start my
  day" when the new Habitica day has not started yet.
- Scene triggers "Habitica daily still to do" (1 to 8 hours before the end of
  the Habitica day, at the time chosen), "Habitica level gained", "Habitica
  health low" (threshold in the configuration) and "All Habitica dailies done".
- Scene actions "Check a Habitica task" (a habit + or −, a daily, a to-do, by
  title), "Create a Habitica to-do", "Start the Habitica day" and "Read
  Habitica" (a sentence for a message or a voice announcement).
- The Custom Day Start of the account followed, in the time zone of Gladys; at
  most one reading every 5 minutes, within Habitica's API limits.
- Every text in English, French, German and Spanish.
