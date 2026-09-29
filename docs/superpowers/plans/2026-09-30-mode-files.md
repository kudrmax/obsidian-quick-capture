# Mode Files Implementation Plan

> Executed inline (superpowers:executing-plans), TDD.

**Goal:** a mode holds several files with aliases; the capture screen lists destinations flat.
**Spec:** `docs/superpowers/specs/2026-09-30-mode-files-design.md`

## Tasks

1. **Domain** — `tests/CaptureMode.test.ts`, `src/domain/CaptureMode.ts`:
   `NoteTarget`, `ModeFile`, `ModeTarget = daily | files`, `Destination {id, mode, title, target}`,
   `listDestinations(modes, today)`, `pickDestination(list, id)`, `destinationProblem`, `markUsed(modes, id, at)`.
2. **Settings migration** — `tests/Settings.test.ts`, `src/settings.ts`: `file` → `files` (row id = mode id),
   `lastModeId` → `lastDestinationId`.
3. **Service** — `tests/CaptureService.test.ts`, `src/application/*`, `ObsidianNoteTargets`: take `Destination`, resolve `NoteTarget`.
4. **UI + main** — `ModePicker`, `CaptureScreen`, `CaptureModal`, `SettingsTab`, `main.ts`: destinations, file rows, commands, `onCaptured`.
5. **Verify** — `npm test`, `npm run build`, run in a throwaway test vault (never `~/Obsidian`), deploy.
