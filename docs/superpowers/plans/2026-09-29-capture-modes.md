# Capture Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Режимы записи (Daily note / File) с наследованием общих настроек, уровень заголовка, пустая строка после заголовка, переименование в Quick Capture.

**Architecture:** Чистый domain-модуль `CaptureMode` (типы, разрешение формата, миграция, выбор режима, фильтр тегов). `CaptureService` получает режим и порт `NoteTargets`. UI: `ModePicker` по образцу `TagPicker`, секция Modes в настройках, команды на каждый режим.

**Tech Stack:** TypeScript, Obsidian API, esbuild, vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-capture-modes-design.md`

## Global Constraints

- UI плагина на английском; общение и доки на русском.
- Существующий текст заметки не меняется — только вставляемые строки.
- `{{time}}` — единственная динамическая переменная.
- Удаление файлов только `trash`.
- Смена режима не теряет текст/аудио; целевой файл определяется в момент отправки.
- CSS-префикс `dqc-` остаётся (переименование только id/имени/классов плагина).
- `npm test` и `npm run build` зелёные после каждой задачи.

## Review Focus

1. Ошибка «нет файла у режима» при отправке **аудио** не должна выбрасывать запись (сейчас `CaptureError` на аудио → discard).
2. Миграция `data.json` пользователя: `heading: "Дневник"` → heading `Дневник`, level 2; теги с иконками сохраняются.
3. Секция с пустой строкой сразу после заголовка — запись встаёт после неё, без двойной пустой строки.
4. Удалённый `lastModeId` → первый режим, без падения экрана.
5. Удалённая группа тегов, id которой остался в режиме — просто игнорируется.

---

### Task 1: SectionInserter — уровень заголовка и пустая строка

**Files:** Modify `src/domain/SectionInserter.ts`, `tests/SectionInserter.test.ts`

**Interfaces:**
- Produces: `interface HeadingTarget { text: string; level: number }`; `insertIntoSection(note: string, heading: HeadingTarget | null, entry: string): string`; `parseHeading(text: string, fallbackLevel: number): HeadingTarget | null` — `"### X"` → `{X,3}`, `"X"` → `{X,fallbackLevel}`, пусто → `null`.

- [ ] Step 1: Переписать тесты под новую сигнатуру (строки заголовка → `parseHeading(...)` или `{text, level}`) и добавить:
  - создание заголовка в непустой заметке: `"text\n"` + `{Journal,2}` → `"text\n\n## Journal\n\n- b\n"`;
  - пустая заметка: `""` → `"### Дневник\n\n- b"`;
  - пустая секция без пустой строки: `"## Journal\n## Tasks\n"` → `"## Journal\n\n- e\n## Tasks\n"`;
  - пустая секция с пустой строкой (старый тест, новое ожидание): `"## Journal\n\n## Tasks\n"` → `"## Journal\n\n- e\n## Tasks\n"`;
  - заголовок в конце файла без записей: `"## Journal"` → `"## Journal\n\n- e"`;
  - непустая секция — как раньше;
  - `null` → конец заметки как раньше;
  - `parseHeading`: `"### Дневник", 2` → `{Дневник,3}`; `"Дневник", 4` → `{Дневник,4}`; `"  ", 2` → `null`.
- [ ] Step 2: `npx vitest run tests/SectionInserter.test.ts` — FAIL (сигнатура / ожидания).
- [ ] Step 3: Реализация: `parseHeading` экспортируется вместо внутреннего `parseHeadingSetting`; линия заголовка `"#".repeat(level) + " " + text`; при создании — `[...spacer, line, "", ...entryLines]`; в `sectionInsertIndex` для пустой секции: если `lines[match.line+1]` существует и пустая — вставка `entry` на `match.line+2`, иначе вставка `["", ...entry]` на `match.line+1`. Вызов в `CaptureService` временно: `insertIntoSection(note, parseHeading(settings.heading, 2), entry)`.
- [ ] Step 4: `npm test` — PASS.
- [ ] Step 5: Commit `Blank line after the heading; heading level passed explicitly`.

### Task 2: Domain-модель режимов и миграция настроек

**Files:** Create `src/domain/CaptureMode.ts`, `tests/CaptureMode.test.ts`; Modify `src/settings.ts`, `tests/Settings.test.ts`

**Interfaces:**
- Produces (в `src/domain/CaptureMode.ts`):
```ts
export interface EntryFormat { heading: string; headingLevel: number; textPrefix: string; textSuffix: string; audioPrefix: string; audioSuffix: string; }
export type HeadingLevelChoice = "default" | "none" | number;
export interface FormatOverrides { heading: string; headingLevel: HeadingLevelChoice; textPrefix: string; textSuffix: string; audioPrefix: string; audioSuffix: string; }
export type ModeTarget = { type: "daily" } | { type: "file"; path: string };
export interface CaptureMode { id: string; name: string; target: ModeTarget; overrides: FormatOverrides; tagGroupIds: string[]; }
export interface ResolvedFormat { heading: HeadingTarget | null; text: EntryTemplate; audio: EntryTemplate; }
export const NO_OVERRIDES: FormatOverrides; // всё "" и headingLevel "default"
export function resolveFormat(defaults: EntryFormat, overrides: FormatOverrides): ResolvedFormat;
export function modeTagGroups<G extends { id: string }>(groups: G[], mode: CaptureMode): G[]; // порядок групп из настроек
export function pickMode(modes: CaptureMode[], id: string): CaptureMode; // fallback modes[0]
export function targetProblem(mode: CaptureMode): string | null; // "Choose a file for mode \"<name>\"" если file и путь пуст или не *.md
export function retainTags(selected: Iterable<string>, groups: { tags: { tag: string }[] }[]): string[];
```
- Produces (в `src/settings.ts`): `TagGroup { id; name; tags }`, `CaptureSettings { defaults: EntryFormat; embedAudio; afterSend; tagGroups: TagGroup[]; modes: CaptureMode[]; lastModeId: string }`, `loadSettings(saved: unknown): CaptureSettings` с миграцией старого формата, `newId(): string` (`crypto.randomUUID()`).

- [ ] Step 1: Тесты `CaptureMode.test.ts`:
  - `resolveFormat`: пустые overrides → общие; непустые поля перекрывают; `headingLevel: 3` перекрывает уровень; `"none"` → `heading: null`; пустой общий heading → `null`; `"### X"` в heading → level 3.
  - `modeTagGroups`: только включённые, в порядке настроек, неизвестные id игнорируются.
  - `pickMode`: по id; неизвестный id → первый.
  - `targetProblem`: daily → null; file `""` / `"a.txt"` → сообщение с именем; `"Books/X.md"` → null.
  - `retainTags`: оставляет только теги из групп (сравнение по `trim()`).
- [ ] Step 2: Тесты `Settings.test.ts`: `loadSettings(null)` → общие дефолты, одна группа нет, режим `Daily` (`id "daily"`, daily, `NO_OVERRIDES`, `tagGroupIds []`), `lastModeId "daily"`; миграция реального старого `data.json` (heading `Дневник`, префиксы, `#transcribe`, группа Daily с like/dislike) → defaults.heading `Дневник`, level 2, группа получила `id "group-1"`, режим Daily включает `["group-1"]`; `"### Дневник"` → heading `Дневник`, level 3; новый формат грузится как есть; списки не разделяются между загрузками.
- [ ] Step 3: `npx vitest run tests/CaptureMode.test.ts tests/Settings.test.ts` — FAIL.
- [ ] Step 4: Реализация. Миграция детерминированная (id `group-N`, `daily`), новый id в UI — `newId()`. `EntryTemplate` импортируется из `EntryFormatter`, `HeadingTarget`/`parseHeading` — из `SectionInserter`.
- [ ] Step 5: Сервис и UI пока компилируются через временные адаптеры не нужно — Task 3 сразу следом; в этой задаче `npm test` зелёный допускается только для новых тестов, `tsc` может падать до Task 3. Ruling в ledger.
- [ ] Step 6: Commit `Capture mode domain model and settings migration`.

### Task 3: CaptureService пишет в цель режима

**Files:** Modify `src/application/ports.ts`, `src/application/CaptureService.ts`, `tests/CaptureService.test.ts`

**Interfaces:**
- Consumes: Task 2 типы, `resolveFormat`, `targetProblem`.
- Produces: `interface NoteTargets { resolve(target: ModeTarget): Promise<string> }` (заменяет `DailyNoteGateway` в зависимостях сервиса); `class TargetError extends Error` (не `CaptureError`); `captureText(mode: CaptureMode, text: string, tags?: readonly string[])`, `captureAudio(mode: CaptureMode, recording, tags?)`.

- [ ] Step 1: Тесты: fake `NoteTargets` (daily → `Daily/2026-09-29.md`, file → path, создаёт пустой). Кейсы: текст в daily с заголовком (`### Дневник\n\n- 21:37 milk`); текст в file-режим; override префикса режима; аудио в file-режим с attachments относительно файла режима; режим без файла → `TargetError`, ни attachments, ни файлов не трогали; существующие тесты переведены на `captureText(DAILY, ...)`.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Реализация: `targetProblem` → `throw new TargetError(...)` до любых side effects; `resolveFormat(settings.defaults, mode.overrides)`; `insertIntoSection(note, format.heading, entry)`.
- [ ] Step 4: `npm test` PASS.
- [ ] Step 5: Commit `Capture service writes to the mode's target`.

### Task 4: Инфраструктура целей

**Files:** Create `src/infrastructure/ObsidianNoteTargets.ts`, `tests/ObsidianNoteTargets.test.ts`; Modify `src/infrastructure/ObsidianDailyNotes.ts` (вынести `ensureParentFolder` в `src/infrastructure/VaultFolders.ts`)

**Interfaces:**
- Produces: `class ObsidianNoteTargets implements NoteTargets { constructor(app, daily: ObsidianDailyNotes); resolve(target); previewPath(target): string }` — `previewPath` для автодополнения ссылок (daily → `todayPath()`, file → path).

- [ ] Step 1: Тесты с `FakeVault` как в `ObsidianDailyNotes.test.ts`: существующий файл → путь без записи; нет файла → созданы папки и пустой файл; путь нормализуется (`/Books//X.md` → `Books/X.md`).
- [ ] Step 2: Run — FAIL. Step 3: реализация. Step 4: `npm test` PASS.
- [ ] Step 5: Commit `Resolve capture targets in the vault`.

### Task 5: Экран записи — плашка и выбор режима

**Files:** Create `src/ui/ModePicker.ts`; Modify `src/ui/CaptureScreen.ts`, `src/ui/CaptureModal.ts`, `src/ui/TagPicker.ts`, `styles.css`

**Interfaces:**
- Consumes: `pickMode`, `modeTagGroups`, `retainTags`, `TargetError`.
- Produces: `CaptureScreenOptions += { initialModeId: string; onModeChange: (id: string) => void }`; `decorateTextInput(textarea, sourcePath: () => string)`; `CaptureModalDependencies += { modeId: () => string; onModeChange; linkSourcePath: (mode) => string }`.

- [ ] Step 1: `ModePicker(screenEl, modes: () => CaptureMode[], current: () => string, onPick: (id) => void, onChange)` — слой `.dqc-modes` под плашкой, класс `is-picking-mode`, пункты `button.dqc-mode` (текущий `is-current`), тап мимо — закрыть. Открытие закрывает TagPicker и наоборот.
- [ ] Step 2: `CaptureScreen`: поле `mode`; плашка `.dqc-mode-pill` (`Name ▾`, `chevron-down`) вверху, скрыта при одном режиме; TagPicker получает `() => modeTagGroups(settings.tagGroups, this.mode)`; при смене режима — `retainTags`, `onModeChange`, перерисовка; состояние/текст/рекордер не трогаются. `requestClose` закрывает любой открытый слой. `send` передаёт режим; `TargetError` → Notice + `setState(previous)` (аудио сохранено). Тексты: `Added to <mode name>`, `Could not add: …`, confirm `It hasn't been added yet.`
- [ ] Step 3: CSS: `.dqc-mode-pill` (маленькая, `--text-muted`, скруглённая), `.dqc-modes` — как `.dqc-tags`, но `justify-content: flex-start` сверху; `is-picking-mode .dqc-body { pointer-events:none }`; затемнение фоном слоя (как iOS-фикс тегов).
- [ ] Step 4: `npm test && npm run build` PASS; проверка в Obsidian через CLI: плашка, выбор, текст остаётся, теги фильтруются, отправка в file-режим (тестовый файл потом в корзину, daily-заметка восстановлена побайтно). Settings в eval — `saveSettings` заглушить.
- [ ] Step 5: Commit `Mode pill and picker on the capture screen`.

### Task 6: Настройки — общие, режимы, группы тегов

**Files:** Modify `src/ui/SettingsTab.ts`; Create `src/ui/FileSuggest.ts`; `styles.css`

- [ ] Step 1: Секция **Defaults**: Heading (без упоминания `###`), Heading level (dropdown H1–H6), префиксы/суффиксы, Embed audio, After sending.
- [ ] Step 2: Секция **Modes**: на режим — заголовок строки с Name + delete (скрыт, если режим один), Type dropdown (`Daily note`/`File`), File (text + `FileSuggest` по `getMarkdownFiles()`, только при File), Heading/Heading level (`Default`, H1–H6, `No heading`)/префиксы/суффиксы с плейсхолдером общего значения, toggle на каждую группу тегов (имя или `Group N`). Кнопка `Add mode` (`newId()`, имя `Mode N`, daily, без overrides, без групп).
- [ ] Step 3: Группы тегов: `Add group` задаёт `id: newId()`; удаление группы убирает её id из режимов.
- [ ] Step 4: `npm run build`, проверка в Obsidian (скриншоты секций), `saveSettings` заглушен при eval.
- [ ] Step 5: Commit `Settings for defaults and capture modes`.

### Task 7: Команды, переименование, деплой с переносом настроек

**Files:** Modify `src/main.ts`, `manifest.json`, `package.json`, `package-lock.json`, `docs/superpowers/specs/2026-09-29-daily-quick-capture-design.md` (шапка: ссылка на новую спеку)

- [ ] Step 1: `QuickCapturePlugin`: `Open quick capture` и лента открывают `lastModeId`; `syncModeCommands()` регистрирует `capture-<id>` → `Capture to <name>` для каждого режима, удаляет устаревшие через `removeCommand` (если метод есть); вызывается в `onload` и `saveSettings`. `onModeChange` сохраняет `lastModeId`.
- [ ] Step 2: manifest `id: quick-capture`, `name: Quick Capture`, новое описание, version `0.2.0`; package name `obsidian-quick-capture`.
- [ ] Step 3: `npm test && npm run build`.
- [ ] Step 4: Деплой: выключить `daily-quick-capture`, `npm run deploy` → `plugins/quick-capture/`, скопировать `data.json` из старой папки, `trash` старой папки, включить `quick-capture` (`app.plugins.loadManifests()` + `enablePluginAndSave`), проверить миграцию в загруженных настройках и что старый плагин исчез из `community-plugins.json`.
- [ ] Step 5: Commit `Rename to Quick Capture; per-mode commands`.
