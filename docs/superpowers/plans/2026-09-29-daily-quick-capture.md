# Daily Quick Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian plugin with a fullscreen capture screen that appends typed text or a voice recording to today's daily note under a configured heading.

**Architecture:** Pure `domain` (formatting, section insertion, token parsing, template rendering) → `application` `CaptureService` over ports → `infrastructure` adapters on the Obsidian API and `MediaRecorder` → `ui` (modal screen ported from the approved spike, suggest, settings tab).

**Tech Stack:** TypeScript, Obsidian API 1.13 typings, esbuild, vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-daily-quick-capture-design.md`

## Global Constraints

- Plugin id `daily-quick-capture`, name `Daily Quick Capture`, `isDesktopOnly: false`, `minAppVersion: 1.6.6`.
- All user-facing strings in English.
- Only dynamic variable: `{{time}}` → `HH:mm`.
- Audio file name `Recording YYYYMMDDHHmmss.<ext>`, saved via `getAvailablePathForAttachment(name, dailyNotePath)`.
- Defaults: heading `""`, text prefix `- {{time}} `, text suffix `""`, audio prefix `- {{time}} `, audio suffix `""`, embed audio `true`, after sending `close`.
- Domain code must not import `obsidian`.
- Deploy target: `~/Obsidian/.obsidian/plugins/daily-quick-capture/`.

## Review Focus

- Notes with CRLF line endings: insertion must keep `\r\n` and not mix separators (SectionInserter test).
- Daily note format containing folders (`YYYY/MM/YYYY-MM-DD`): all parent folders are created (ObsidianDailyNotes uses `ensureFolder` for the full parent path; covered by `dailyNotePath` test).
- Text containing `$&`, `$1`, `{{time}}`-like braces: inserted literally, no regex replacement artefacts (EntryFormatter + SectionInserter tests).
- `#` inside a word (`C#`, `url#anchor`) must not open tag suggestions (CaptureToken test).
- Empty recording blob (Stop right after start): nothing is written, user sees `Recording is empty` (CaptureService test).

---

### Task 1: Project scaffold, Clock and EntryFormatter

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `deploy.mjs`, `manifest.json`, `versions.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/domain/Clock.ts`, `src/domain/EntryFormatter.ts`
- Test: `tests/EntryFormatter.test.ts`

**Interfaces:**
- Produces:
  - `interface Clock { now(): Date }`
  - `class EntryFormatter { constructor(clock: Clock); format(template: EntryTemplate, content: string): string }`
  - `interface EntryTemplate { prefix: string; suffix: string }`

- [ ] **Step 1: Scaffold**

`package.json`:
```json
{
  "name": "obsidian-daily-quick-capture",
  "version": "0.1.0",
  "private": true,
  "main": "main.js",
  "scripts": {
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "deploy": "npm run build && node deploy.mjs",
    "test": "vitest run"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^26.6.3",
    "esbuild": "^0.28.2",
    "obsidian": "^1.13.1",
    "typescript": "^7.0.2",
    "vitest": "^5.0.2"
  }
}
```

`manifest.json`:
```json
{
  "id": "daily-quick-capture",
  "name": "Daily Quick Capture",
  "version": "0.1.0",
  "minAppVersion": "1.6.6",
  "description": "Fullscreen quick capture of text and voice into today's daily note.",
  "author": "kudrmax",
  "authorUrl": "https://github.com/kudrmax",
  "isDesktopOnly": false
}
```

`versions.json`: `{ "0.1.0": "1.6.6" }`

`tsconfig.json` — same as the spike plus `"esModuleInterop": true` and `"include": ["src/**/*.ts", "tests/**/*.ts"]`.

`esbuild.config.mjs`, `deploy.mjs` — copy from branch `spike/screen-variants` unchanged.

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

`.gitignore`: `node_modules`, `main.js`.

Run `npm install` (replace the `node_modules` symlink with a real install).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { EntryFormatter } from "../src/domain/EntryFormatter";

const clock = { now: () => new Date(2026, 8, 29, 23, 5) };
const formatter = new EntryFormatter(clock);

describe("EntryFormatter", () => {
	it("wraps content with prefix and suffix", () => {
		expect(formatter.format({ prefix: "- ", suffix: " #inbox" }, "milk")).toBe("- milk #inbox");
	});

	it("replaces every {{time}} with zero-padded HH:mm", () => {
		expect(formatter.format({ prefix: "- {{time}} ", suffix: " ({{time}})" }, "x")).toBe("- 23:05 x (23:05)");
	});

	it("keeps other placeholders and replacement patterns literally", () => {
		expect(formatter.format({ prefix: "{{date}} ", suffix: "" }, "cost $& and $1")).toBe("{{date}} cost $& and $1");
	});

	it("keeps multiline content as is", () => {
		expect(formatter.format({ prefix: "- ", suffix: " #t" }, "a\nb")).toBe("- a\nb #t");
	});
});
```

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run tests/EntryFormatter.test.ts`, expected: cannot resolve `EntryFormatter`.

- [ ] **Step 4: Implement**

`src/domain/Clock.ts`:
```ts
export interface Clock {
	now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
```

`src/domain/EntryFormatter.ts`:
```ts
import { Clock } from "./Clock";

export interface EntryTemplate {
	prefix: string;
	suffix: string;
}

const TIME_PLACEHOLDER = "{{time}}";

export class EntryFormatter {
	constructor(private readonly clock: Clock) {}

	format(template: EntryTemplate, content: string): string {
		const time = this.currentTime();
		return [template.prefix, content, template.suffix]
			.map((part, index) => (index === 1 ? part : part.split(TIME_PLACEHOLDER).join(time)))
			.join("");
	}

	private currentTime(): string {
		const now = this.clock.now();
		return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	}
}
```

- [ ] **Step 5: Run tests** — PASS. `npm run build` compiles (main.ts may be a stub `export default class extends Plugin {}` until Task 9).
- [ ] **Step 6: Commit** — `feat: scaffold plugin and entry formatter`.

---

### Task 2: SectionInserter

**Files:**
- Create: `src/domain/SectionInserter.ts`
- Test: `tests/SectionInserter.test.ts`

**Interfaces:**
- Produces: `function insertIntoSection(note: string, heading: string, entry: string): string`

Rules (spec §6): headings are ATX lines `^(#{1,6})\s+(.*?)\s*#*\s*$`, ignored inside leading frontmatter (`---` … `---` at file start) and inside fenced code blocks (``` or ~~~). Match first heading whose text equals `heading` trimmed, case-insensitive. Section ends before the next heading with level ≤ matched level. Insert after the last non-blank line of the section. Empty/absent heading → append at end on a new line. Line separator is detected (`\r\n` if present, else `\n`) and preserved.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { insertIntoSection } from "../src/domain/SectionInserter";

describe("insertIntoSection", () => {
	it("appends to the end of the matched section before the next same-level heading", () => {
		const note = "# Day\n## Journal\n- a\n\n## Tasks\n- t\n";
		expect(insertIntoSection(note, "journal", "- b")).toBe("# Day\n## Journal\n- a\n- b\n\n## Tasks\n- t\n");
	});

	it("keeps deeper headings inside the section", () => {
		const note = "## Journal\n### Morning\n- m\n## Tasks\n";
		expect(insertIntoSection(note, "Journal", "- e")).toBe("## Journal\n### Morning\n- m\n- e\n## Tasks\n");
	});

	it("inserts right after an empty section heading", () => {
		expect(insertIntoSection("## Journal\n\n## Tasks\n", "Journal", "- e")).toBe("## Journal\n- e\n\n## Tasks\n");
	});

	it("extends a section that runs to the end of file", () => {
		expect(insertIntoSection("## Journal\n- a", "Journal", "- b")).toBe("## Journal\n- a\n- b");
	});

	it("appends to the end of the note when the heading is missing", () => {
		expect(insertIntoSection("text\n", "Journal", "- b")).toBe("text\n- b\n");
		expect(insertIntoSection("text", "Journal", "- b")).toBe("text\n- b");
	});

	it("appends to the end of the note when heading setting is empty", () => {
		expect(insertIntoSection("## Journal\n- a\n## Tasks\n", "  ", "- b")).toBe("## Journal\n- a\n## Tasks\n- b\n");
	});

	it("writes into an empty note", () => {
		expect(insertIntoSection("", "Journal", "- b")).toBe("- b");
	});

	it("ignores headings inside frontmatter and code fences", () => {
		const note = "---\n# Journal: yaml comment\n---\n```\n# Journal\n```\n## Journal\n- a\n";
		expect(insertIntoSection(note, "Journal", "- b")).toBe(note.replace("- a\n", "- a\n- b\n"));
	});

	it("matches headings with closing hashes and extra spaces", () => {
		expect(insertIntoSection("##   Journal  ##\n- a\n", "Journal", "- b")).toBe("##   Journal  ##\n- a\n- b\n");
	});

	it("preserves CRLF line endings", () => {
		expect(insertIntoSection("## Journal\r\n- a\r\n## T\r\n", "Journal", "- b\nc")).toBe("## Journal\r\n- a\r\n- b\r\nc\r\n## T\r\n");
	});

	it("inserts multiline entries and replacement patterns literally", () => {
		expect(insertIntoSection("## Journal\n", "Journal", "- $& x\ny")).toBe("## Journal\n- $& x\ny\n");
	});
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
interface Heading {
	line: number;
	level: number;
	text: string;
}

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]*(```|~~~)/;

export function insertIntoSection(note: string, heading: string, entry: string): string {
	const separator = note.includes("\r\n") ? "\r\n" : "\n";
	const lines = note.split(/\r?\n/);
	const entryLines = entry.split(/\r?\n/);
	const target = heading.trim().toLowerCase();
	const headings = findHeadings(lines);
	const match = target === "" ? undefined : headings.find((h) => h.text.trim().toLowerCase() === target);

	if (!match) return appendToEnd(note, lines, entryLines, separator);

	const next = headings.find((h) => h.line > match.line && h.level <= match.level);
	const sectionEnd = next ? next.line : lines.length;
	let insertAt = match.line + 1;
	for (let i = sectionEnd - 1; i > match.line; i--) {
		if (lines[i].trim() !== "") {
			insertAt = i + 1;
			break;
		}
	}
	lines.splice(insertAt, 0, ...entryLines);
	return lines.join(separator);
}

function appendToEnd(note: string, lines: string[], entryLines: string[], separator: string): string {
	if (note === "") return entryLines.join(separator);
	const endsWithNewline = lines[lines.length - 1] === "";
	if (endsWithNewline) lines.splice(lines.length - 1, 0, ...entryLines);
	else lines.push(...entryLines);
	return lines.join(separator);
}

function findHeadings(lines: string[]): Heading[] {
	const headings: Heading[] = [];
	let index = skipFrontmatter(lines);
	let fence: string | null = null;
	for (; index < lines.length; index++) {
		const line = lines[index];
		const fenceMatch = FENCE.exec(line);
		if (fenceMatch) {
			if (fence === null) fence = fenceMatch[1];
			else if (fenceMatch[1] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const match = HEADING.exec(line);
		if (match) headings.push({ line: index, level: match[1].length, text: match[2] });
	}
	return headings;
}

function skipFrontmatter(lines: string[]): number {
	if (lines[0] !== "---") return 0;
	const end = lines.indexOf("---", 1);
	return end === -1 ? 0 : end + 1;
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `feat: insert entries into heading sections`.

---

### Task 3: CaptureToken

**Files:**
- Create: `src/domain/CaptureToken.ts`
- Test: `tests/CaptureToken.test.ts`

**Interfaces:**
- Produces:
  - `type CaptureToken = { kind: "tag" | "link"; query: string; start: number; end: number }`
  - `function findTokenAtCursor(text: string, cursor: number): CaptureToken | null`
  - `function replaceToken(text: string, token: CaptureToken, replacement: string): { text: string; cursor: number }`

Rules: tag token = `#` at string start or after whitespace, followed by `[^\s#]*` up to cursor; `start` points at `#`. Link token = last `[[` before cursor with no `]]` and no newline between; query = text after `[[`; `start` points at the first `[`. `end` = cursor. `replaceToken` substitutes `[start, end)` with `replacement + " "` and returns the cursor after the space.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findTokenAtCursor, replaceToken } from "../src/domain/CaptureToken";

const at = (text: string) => findTokenAtCursor(text, text.length);

describe("findTokenAtCursor", () => {
	it("finds a tag after whitespace or at start", () => {
		expect(at("buy #gro")).toEqual({ kind: "tag", query: "gro", start: 4, end: 8 });
		expect(at("#")).toEqual({ kind: "tag", query: "", start: 0, end: 1 });
	});

	it("ignores # inside a word", () => {
		expect(at("learn C#")).toBeNull();
		expect(at("site.com/page#top")).toBeNull();
	});

	it("finds an unfinished link", () => {
		expect(at("see [[Proj")).toEqual({ kind: "link", query: "Proj", start: 4, end: 10 });
		expect(at("[[")).toEqual({ kind: "link", query: "", start: 0, end: 2 });
	});

	it("ignores closed links and links across lines", () => {
		expect(at("[[Done]] and")).toBeNull();
		expect(at("[[a\nb")).toBeNull();
	});

	it("returns null for plain text and tags ended by space", () => {
		expect(at("hello")).toBeNull();
		expect(at("#tag ")).toBeNull();
	});

	it("uses the cursor, not the end of text", () => {
		expect(findTokenAtCursor("#ab rest", 3)).toEqual({ kind: "tag", query: "ab", start: 0, end: 3 });
	});
});

describe("replaceToken", () => {
	it("replaces the token and places the cursor after a trailing space", () => {
		const text = "see [[Pro rest";
		const token = findTokenAtCursor(text, 9)!;
		expect(replaceToken(text, token, "[[Project]]")).toEqual({ text: "see [[Project]]  rest", cursor: 16 });
	});
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
export interface CaptureToken {
	kind: "tag" | "link";
	query: string;
	start: number;
	end: number;
}

export function findTokenAtCursor(text: string, cursor: number): CaptureToken | null {
	const before = text.slice(0, cursor);
	return findLink(before) ?? findTag(before);
}

export function replaceToken(text: string, token: CaptureToken, replacement: string): { text: string; cursor: number } {
	const inserted = `${replacement} `;
	return {
		text: text.slice(0, token.start) + inserted + text.slice(token.end),
		cursor: token.start + inserted.length,
	};
}

function findLink(before: string): CaptureToken | null {
	const open = before.lastIndexOf("[[");
	if (open === -1) return null;
	const query = before.slice(open + 2);
	if (query.includes("]]") || /[\r\n]/.test(query)) return null;
	return { kind: "link", query, start: open, end: before.length };
}

function findTag(before: string): CaptureToken | null {
	const match = /(^|\s)#([^\s#]*)$/.exec(before);
	if (!match) return null;
	const start = before.length - match[2].length - 1;
	return { kind: "tag", query: match[2], start, end: before.length };
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `feat: detect tag and link tokens at cursor`.

---

### Task 4: DailyNoteTemplate (pure template rendering and path)

**Files:**
- Create: `src/domain/DailyNoteTemplate.ts`
- Test: `tests/DailyNoteTemplate.test.ts`

**Interfaces:**
- Produces:
  - `type DateFormatter = (date: Date, format: string) => string` (moment-compatible; injected, domain stays Obsidian-free)
  - `function dailyNotePath(folder: string, format: string, date: Date, formatDate: DateFormatter): string`
  - `function renderDailyTemplate(template: string, title: string, date: Date, formatDate: DateFormatter): string`

Rules: path = `normalized folder + "/" + formatDate(date, format || "YYYY-MM-DD") + ".md"`, folder trimmed of leading/trailing slashes; empty folder → no prefix. Template tokens as core Daily notes: `{{title}}`, `{{date}}` (→ `YYYY-MM-DD`), `{{time}}` (→ `HH:mm`), `{{date:FMT}}`, `{{time:FMT}}`, case-insensitive, whitespace-tolerant inside braces.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { dailyNotePath, renderDailyTemplate } from "../src/domain/DailyNoteTemplate";

const date = new Date(2026, 8, 29, 7, 4);
const fmt = (d: Date, f: string) =>
	f.replaceAll("YYYY", String(d.getFullYear()))
		.replaceAll("MM", String(d.getMonth() + 1).padStart(2, "0"))
		.replaceAll("DD", String(d.getDate()).padStart(2, "0"))
		.replaceAll("HH", String(d.getHours()).padStart(2, "0"))
		.replaceAll("mm", String(d.getMinutes()).padStart(2, "0"));

describe("dailyNotePath", () => {
	it("joins folder and formatted name", () => {
		expect(dailyNotePath("/Journal/Daily notes/", "YYYY-MM-DD", date, fmt)).toBe("Journal/Daily notes/2026-09-29.md");
	});

	it("supports folders inside the format and empty settings", () => {
		expect(dailyNotePath("", "YYYY/MM/YYYY-MM-DD", date, fmt)).toBe("2026/09/2026-09-29.md");
		expect(dailyNotePath("", "", date, fmt)).toBe("2026-09-29.md");
	});
});

describe("renderDailyTemplate", () => {
	it("replaces core daily note tokens", () => {
		const template = "# {{title}}\n{{date}} {{time}} {{ DATE:YYYY }} {{time:HH}}";
		expect(renderDailyTemplate(template, "2026-09-29", date, fmt)).toBe("# 2026-09-29\n2026-09-29 07:04 2026 07");
	});
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
export type DateFormatter = (date: Date, format: string) => string;

const DEFAULT_FORMAT = "YYYY-MM-DD";

export function dailyNotePath(folder: string, format: string, date: Date, formatDate: DateFormatter): string {
	const name = formatDate(date, format.trim() || DEFAULT_FORMAT);
	const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
	return cleanFolder ? `${cleanFolder}/${name}.md` : `${name}.md`;
}

export function renderDailyTemplate(template: string, title: string, date: Date, formatDate: DateFormatter): string {
	return template
		.replace(/{{\s*title\s*}}/gi, () => title)
		.replace(/{{\s*(date|time)\s*(?::(.*?))?\s*}}/gi, (_, kind: string, format?: string) => {
			const fallback = kind.toLowerCase() === "date" ? DEFAULT_FORMAT : "HH:mm";
			return formatDate(date, format?.trim() || fallback);
		});
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `feat: daily note path and template rendering`.

---

### Task 5: CaptureService

**Files:**
- Create: `src/application/ports.ts`, `src/application/CaptureService.ts`, `src/settings.ts`
- Test: `tests/CaptureService.test.ts`

**Interfaces:**
- Consumes: `EntryFormatter`, `insertIntoSection`.
- Produces:

```ts
// ports.ts
export interface DailyNoteGateway {
	getOrCreateToday(): Promise<string>; // vault path of today's note
}
export interface NoteWriter {
	update(path: string, transform: (content: string) => string): Promise<void>;
}
export interface SavedAttachment {
	path: string;
	link: string; // markdown or wiki link from the note, without "!"
}
export interface AttachmentStore {
	save(fileName: string, data: ArrayBuffer, notePath: string): Promise<SavedAttachment>;
	discard(path: string): Promise<void>;
}
export interface AudioRecording {
	data: ArrayBuffer;
	extension: string; // "m4a" | "webm" | "ogg"
}

// settings.ts
export interface CaptureSettings {
	heading: string;
	textPrefix: string;
	textSuffix: string;
	audioPrefix: string;
	audioSuffix: string;
	embedAudio: boolean;
	afterSend: "close" | "stay";
}
export const DEFAULT_SETTINGS: CaptureSettings; // values from Global Constraints

// CaptureService.ts
export class CaptureError extends Error {}
export class CaptureService {
	constructor(deps: { dailyNotes: DailyNoteGateway; notes: NoteWriter; attachments: AttachmentStore; clock: Clock; settings: () => CaptureSettings });
	captureText(text: string): Promise<void>;
	captureAudio(recording: AudioRecording): Promise<void>;
}
```

Behaviour: `captureText` rejects blank text with `CaptureError("Nothing to add")`. `captureAudio` rejects empty data with `CaptureError("Recording is empty")`; resolves note path first, saves the file as `Recording YYYYMMDDHHmmss.<ext>` (time from clock), formats `(embedAudio ? "!" : "") + link`, inserts; if insertion throws, calls `attachments.discard(path)` and rethrows.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CaptureError, CaptureService } from "../src/application/CaptureService";
import { AttachmentStore, DailyNoteGateway, NoteWriter } from "../src/application/ports";
import { CaptureSettings, DEFAULT_SETTINGS } from "../src/settings";

class FakeNotes implements DailyNoteGateway, NoteWriter {
	files = new Map<string, string>();
	failWrites = false;
	async getOrCreateToday(): Promise<string> {
		if (!this.files.has("Daily/2026-09-29.md")) this.files.set("Daily/2026-09-29.md", "");
		return "Daily/2026-09-29.md";
	}
	async update(path: string, transform: (content: string) => string): Promise<void> {
		if (this.failWrites) throw new Error("disk full");
		this.files.set(path, transform(this.files.get(path) ?? ""));
	}
}

class FakeAttachments implements AttachmentStore {
	saved: string[] = [];
	discarded: string[] = [];
	async save(fileName: string) {
		const path = `Files/${fileName}`;
		this.saved.push(path);
		return { path, link: `[[${fileName}]]` };
	}
	async discard(path: string) {
		this.discarded.push(path);
	}
}

function setup(overrides: Partial<CaptureSettings> = {}) {
	const notes = new FakeNotes();
	const attachments = new FakeAttachments();
	const settings = { ...DEFAULT_SETTINGS, heading: "Journal", ...overrides };
	const service = new CaptureService({
		dailyNotes: notes,
		notes,
		attachments,
		clock: { now: () => new Date(2026, 8, 29, 21, 37, 5) },
		settings: () => settings,
	});
	return { notes, attachments, service };
}

const audio = { data: new Uint8Array([1, 2]).buffer, extension: "m4a" };

describe("CaptureService", () => {
	it("appends formatted text to today's note", async () => {
		const { notes, service } = setup({ textSuffix: " #inbox" });
		await service.captureText("milk");
		expect(notes.files.get("Daily/2026-09-29.md")).toBe("- 21:37 milk #inbox");
	});

	it("rejects blank text", async () => {
		const { service } = setup();
		await expect(service.captureText("  \n")).rejects.toBeInstanceOf(CaptureError);
	});

	it("saves audio and embeds it with the audio template", async () => {
		const { notes, attachments, service } = setup({ audioSuffix: " #transcribe" });
		await service.captureAudio(audio);
		expect(attachments.saved).toEqual(["Files/Recording 20260929213705.m4a"]);
		expect(notes.files.get("Daily/2026-09-29.md")).toBe("- 21:37 ![[Recording 20260929213705.m4a]] #transcribe");
	});

	it("links audio without embedding when configured", async () => {
		const { notes, service } = setup({ embedAudio: false });
		await service.captureAudio(audio);
		expect(notes.files.get("Daily/2026-09-29.md")).toBe("- 21:37 [[Recording 20260929213705.m4a]]");
	});

	it("rejects an empty recording without touching files", async () => {
		const { attachments, service } = setup();
		await expect(service.captureAudio({ data: new ArrayBuffer(0), extension: "m4a" })).rejects.toThrow("Recording is empty");
		expect(attachments.saved).toEqual([]);
	});

	it("discards the saved file when writing the note fails", async () => {
		const { notes, attachments, service } = setup();
		notes.failWrites = true;
		await expect(service.captureAudio(audio)).rejects.toThrow("disk full");
		expect(attachments.discarded).toEqual(["Files/Recording 20260929213705.m4a"]);
	});
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `ports.ts` and `settings.ts` exactly as in Interfaces, and:

```ts
import { Clock } from "../domain/Clock";
import { EntryFormatter, EntryTemplate } from "../domain/EntryFormatter";
import { insertIntoSection } from "../domain/SectionInserter";
import { CaptureSettings } from "../settings";
import { AttachmentStore, AudioRecording, DailyNoteGateway, NoteWriter } from "./ports";

export class CaptureError extends Error {}

interface CaptureDependencies {
	dailyNotes: DailyNoteGateway;
	notes: NoteWriter;
	attachments: AttachmentStore;
	clock: Clock;
	settings: () => CaptureSettings;
}

export class CaptureService {
	private readonly formatter: EntryFormatter;

	constructor(private readonly deps: CaptureDependencies) {
		this.formatter = new EntryFormatter(deps.clock);
	}

	async captureText(text: string): Promise<void> {
		if (text.trim() === "") throw new CaptureError("Nothing to add");
		const settings = this.deps.settings();
		const notePath = await this.deps.dailyNotes.getOrCreateToday();
		await this.append(notePath, { prefix: settings.textPrefix, suffix: settings.textSuffix }, text);
	}

	async captureAudio(recording: AudioRecording): Promise<void> {
		if (recording.data.byteLength === 0) throw new CaptureError("Recording is empty");
		const settings = this.deps.settings();
		const notePath = await this.deps.dailyNotes.getOrCreateToday();
		const saved = await this.deps.attachments.save(this.recordingFileName(recording.extension), recording.data, notePath);
		const content = `${settings.embedAudio ? "!" : ""}${saved.link}`;
		try {
			await this.append(notePath, { prefix: settings.audioPrefix, suffix: settings.audioSuffix }, content);
		} catch (error) {
			await this.deps.attachments.discard(saved.path);
			throw error;
		}
	}

	private async append(notePath: string, template: EntryTemplate, content: string): Promise<void> {
		const entry = this.formatter.format(template, content);
		const heading = this.deps.settings().heading;
		await this.deps.notes.update(notePath, (note) => insertIntoSection(note, heading, entry));
	}

	private recordingFileName(extension: string): string {
		const d = this.deps.clock.now();
		const pad = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `Recording ${stamp}.${extension}`;
	}
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `feat: capture service for text and audio`.

---

### Task 6: Obsidian adapters

**Files:**
- Create: `src/infrastructure/ObsidianDailyNotes.ts`, `src/infrastructure/ObsidianNoteWriter.ts`, `src/infrastructure/ObsidianAttachments.ts`

**Interfaces:**
- Consumes: ports from Task 5, `dailyNotePath`, `renderDailyTemplate` from Task 4.
- Produces: `new ObsidianDailyNotes(app)`, `new ObsidianNoteWriter(app)`, `new ObsidianAttachments(app)` implementing the ports.

Details:
- `ObsidianDailyNotes.getOrCreateToday()`: read options from `app.internalPlugins.getPluginById("daily-notes")?.instance?.options` (typed locally as `{ folder?: string; format?: string; template?: string }`, all optional). `formatDate = (d, f) => window.moment(d).format(f)`. Compute path; if `vault.getFileByPath(path)` exists return it; else ensure every parent folder (`vault.createFolder` for each missing segment), read template file (`template` setting + `.md` if no extension, resolved with `metadataCache.getFirstLinkpathDest(template, "")`), render with title = basename, `vault.create(path, content)`. Return path.
- `ObsidianNoteWriter.update(path, fn)`: `vault.getFileByPath` → `vault.process(file, fn)`; missing file → `throw new Error(\`Note not found: ${path}\`)`.
- `ObsidianAttachments.save(name, data, notePath)`: `const path = await app.fileManager.getAvailablePathForAttachment(name, notePath)`; `const file = await app.vault.createBinary(path, data)`; link = `app.fileManager.generateMarkdownLink(file, notePath)`. `discard(path)`: `app.fileManager.trashFile(file)` if it exists.

- [ ] **Step 1: Implement the three adapters as described.**
- [ ] **Step 2: `npm run build`** — compiles without errors.
- [ ] **Step 3: Commit** — `feat: obsidian adapters for daily notes, notes and attachments`.

(Verified end-to-end in Task 9 through the Obsidian CLI.)

---

### Task 7: Audio recorder

**Files:**
- Create: `src/infrastructure/MediaAudioRecorder.ts`

**Interfaces:**
- Produces:

```ts
export interface AudioRecorder {
	start(): Promise<void>;      // asks for the microphone, starts recording
	pause(): void;
	resume(): void;
	stop(): Promise<AudioRecording>;
	cancel(): void;              // stops and releases the microphone, drops data
	level(): number;             // 0..1 current input level
}
export class MediaAudioRecorder implements AudioRecorder {}
```

Details: pick first `MediaRecorder.isTypeSupported` of `audio/webm;codecs=opus` → `webm`, `audio/mp4` → `m4a`, `audio/ogg;codecs=opus` → `ogg`; if none supported, construct without mimeType and derive extension from `recorder.mimeType` (fallback `webm`). Start with `recorder.start(1000)` collecting `dataavailable` chunks. Level via `AudioContext` + `AnalyserNode` (RMS of time domain, `min(1, sqrt(rms) * 2.2)` — same as the spike). `stop()` resolves on `stop` event with `new Blob(chunks, { type }).arrayBuffer()`. Both `stop` and `cancel` stop all tracks and close the audio context. Missing `navigator.mediaDevices` or `MediaRecorder` → throw `Error("recording is not supported on this device")`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: `npm run build`.**
- [ ] **Step 3: Commit** — `feat: MediaRecorder-based audio recorder`.

---

### Task 8: Capture screen, modal, suggest

**Files:**
- Create: `src/ui/Waveform.ts` (copy from spike `src/Waveform.ts`), `src/ui/CaptureScreen.ts`, `src/ui/CaptureModal.ts`, `src/ui/CaptureSuggest.ts`, `styles.css` (copy from spike, then adjust)

**Interfaces:**
- Consumes: `CaptureService`, `CaptureError`, `AudioRecorder`, `CaptureSettings`, `findTokenAtCursor`, `replaceToken`.
- Produces: `new CaptureModal(app, { service: CaptureService; createRecorder: () => AudioRecorder; settings: () => CaptureSettings; linkSourcePath: () => string })`.

Port from spike branch `spike/screen-variants` (`src/CaptureScreen.ts`, `src/hosts.ts`, `styles.css` at commit `84ce68c`), with these changes:
- Replace `LevelSource`/fake signal with the injected `AudioRecorder`: record → `recorder.start()` (error → `Notice("Microphone is not available: …")`), pause/resume → recorder, stop → `await recorder.stop()` kept as `pendingRecording`, discard/close → `recorder.cancel()`; waveform samples `recorder.level()`.
- Send → `service.captureText(text)` or `service.captureAudio(pendingRecording)`. Success → `Notice("Added to daily note")`, then close or reset by `settings().afterSend`. Failure → `Notice("Could not add to daily note: " + message)` and return to the previous state (text stays, `stopped` with the same recording).
- Remove the debug line and the settings it used.
- Swipe down: `touchstart`/`touchend` on the screen root; if `dy >= 60 && |dy| > |dx|` and the textarea is focused → `textarea.blur()`.
- Attach `new CaptureSuggest(app, textarea, linkSourcePath)`.

`CaptureSuggest extends AbstractInputSuggest<Suggestion>` (constructor cast `textarea as unknown as HTMLInputElement`), `limit = 20`:
- `getSuggestions(_)`: token = `findTokenAtCursor(textarea.value, textarea.selectionStart)`; none → `[]`. Tag → all tags from `getAllTags(metadataCache.getFileCache(f))` over `vault.getMarkdownFiles()`, counted, filtered by `prepareFuzzySearch(query)` (empty query → all), sorted by fuzzy score then count desc. Link → markdown files, matched on basename and `frontmatter.aliases`, sorted by score.
- `renderSuggestion`: tag → `#tag` + count; link → basename (+ `alias → basename` when matched by alias) and parent folder path muted.
- `selectSuggestion(s)`: replacement `#tag` or `app.fileManager.generateMarkdownLink(file, sourcePath)`; `replaceToken`, set value, set selection to the new cursor, dispatch `input` event (so the Send button and height update), `close()`.

- [ ] **Step 1: Port and adapt the files.**
- [ ] **Step 2: `npm run build`.**
- [ ] **Step 3: Commit** — `feat: capture screen with recording and suggestions`.

---

### Task 9: Settings tab, plugin wiring, deploy and verification

**Files:**
- Create: `src/ui/SettingsTab.ts`, `src/main.ts`

**Interfaces:**
- Consumes: everything above.

`main.ts`: load settings (`{ ...DEFAULT_SETTINGS, ...loadData() }`), build `CaptureService` with the adapters and `systemClock`, ribbon `mic` "Open quick capture", command `open` "Open quick capture", settings tab.

`SettingsTab`: text fields Heading, Text prefix, Text suffix, Audio prefix, Audio suffix (descriptions mention `{{time}}` → `HH:mm` and that leading/trailing spaces matter); toggle Embed audio (desc: `![[…]]` vs `[[…]]`); dropdown After sending.

- [ ] **Step 1: Implement; `npm test` and `npm run build` pass.**
- [ ] **Step 2: Deploy** — `npm run deploy`; enable `daily-quick-capture` in the vault (`app.plugins.loadManifests()` + `enablePluginAndSave`), disable the spike plugin and move `~/Obsidian/.obsidian/plugins/daily-quick-capture-spike` to trash with `trash`.
- [ ] **Step 3: Verify on desktop through the Obsidian CLI** (open the modal via the command, drive it, always close it via its Close button):
  - text entry lands at the end of today's note (heading empty) with `- HH:mm ` prefix;
  - set heading to an existing heading in a scratch note scenario: use a temporary daily-notes-like check by calling the service on a test file is not possible, so instead verify with heading `Дела` on today's note that the entry lands at the end of that section, then remove the added line;
  - `#` and `[[` suggestions appear and insert tokens;
  - audio flow with a real microphone is verified by the user on iPhone.
  Revert every test line added to the real daily note afterwards.
- [ ] **Step 4: Commit** — `feat: settings tab and plugin wiring`.
