# План: несколько вопросов в одной записи

Спека: `../specs/2026-10-28-questions-in-entry-design.md`. Прототип с макетами живёт вне репозитория
(scratchpad); код из него переносится с чисткой, а не копируется.

1. **Domain.** `Question { text, required }`, `CaptureMode.questions`, `answerPrefix` / `answerSuffix`
   в `EntryFormat` / `FormatOverrides` / `ResolvedFormat.answer`, `{{question}}` в `EntryFormatter`.
   `askedQuestions(mode)` — вопросы с непустым текстом. Тесты: `CaptureMode`, `EntryFormatter`.
2. **Settings.** Дефолт `answerPrefix = "\t- **{{question}}** "`, миграция `questions: []` для
   сохранённых режимов и старых настроек. Тесты: `Settings`.
3. **Service.** `captureAnswers(destination, answers, tags)`: шапка по `Text`, строки по `Answer`,
   пустые ответы пропускаются, голос — через `saveParts` с откатом вложений при ошибке записи;
   `CaptureError`, если нет ни одного ответа или пуст обязательный. Тесты: `CaptureService`.
4. **Preview.** `previewEntries` показывает шапку и строки ответов, `modeSummary` — число вопросов.
   Тесты: `SettingsPreview`.
5. **Capture screen.** Поля вопросов (`QuestionFields` — отдельный класс в `src/ui`), подписи
   с `*`, текущее поле, голосовой ответ («✓ взять как ответ», 🗑), «отправить» всегда в центре,
   неактивна до выполнения условий. Режим без вопросов не меняется.
6. **Settings tab.** Блок `Questions`: строки `[поле] [Required-чип] [↑] [↓] [×]` на существующих
   `line` / `TextComponent` / `dqc-chip` / `iconButton`, `+ Add question`, подсказка; строка `Answer`
   через `namedLine`. Новых компонентов и стилей кнопок нет.
7. **Проверка.** Харнесс на реальном коде: замер rect'ов во всех состояниях, сравнение с текущим
   экраном. `npm run build`, `npm test`.
