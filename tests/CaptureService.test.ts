import { describe, expect, it } from "vitest";
import { Answer, CaptureError, CaptureService, TargetError } from "../src/application/CaptureService";
import { AttachmentStore, NoteTargets, NoteWriter } from "../src/application/ports";
import { CaptureMode, Destination, EntryFormat, NO_OVERRIDES, NoteTarget } from "../src/domain/CaptureMode";
import { CaptureSettings, DEFAULT_SETTINGS } from "../src/settings";

const NOTE = "Daily/2026-09-29.md";

class FakeNotes implements NoteTargets, NoteWriter {
	files = new Map<string, string>();
	failWrites = false;

	async resolve(target: NoteTarget): Promise<string> {
		const path = target.type === "daily" ? NOTE : target.path;
		if (!this.files.has(path)) this.files.set(path, "");
		return path;
	}

	async update(path: string, transform: (content: string) => string): Promise<void> {
		if (this.failWrites) throw new Error("disk full");
		this.files.set(path, transform(this.files.get(path) ?? ""));
	}
}

class FakeAttachments implements AttachmentStore {
	saved: string[] = [];
	savedFor: string[] = [];
	discarded: string[] = [];
	failOnSave: number | null = null;

	async save(fileName: string, _data: ArrayBuffer, notePath: string) {
		if (this.saved.length === this.failOnSave) throw new Error("vault is read-only");
		const path = `Files/${fileName}`;
		this.saved.push(path);
		this.savedFor.push(notePath);
		return { path, link: `[[${fileName}]]` };
	}

	async discard(path: string) {
		this.discarded.push(path);
	}
}

const DAILY_MODE: CaptureMode = { id: "daily", title: "", target: { type: "daily", daysBack: 0 }, overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default", tagGroupIds: [], questions: [], headLine: true };
const BOOKS_MODE: CaptureMode = {
	id: "books",
	title: "Книги",
	target: { type: "files", files: [{ id: "book", alias: "Book", path: "Books/Book.md", lastUsedAt: 0 }] },
	overrides: { ...NO_OVERRIDES, heading: "Цитаты", textPrefix: "> " }, afterSend: "default", audioLink: "default",
	tagGroupIds: [],
	questions: [],
	headLine: true,
};
const MORNING_MODE: CaptureMode = {
	...DAILY_MODE,
	id: "morning",
	overrides: { ...NO_OVERRIDES, heading: "Утро" },
	questions: [
		{ text: "Как встал?", required: true },
		{ text: " ", required: true },
		{ text: "Что тянуло встать?", required: false },
		{ text: "Что делал утром?", required: false },
	],
};
const MORNING: Destination = { id: "morning", mode: MORNING_MODE, title: "Утро", target: { type: "daily", daysBack: 0 } };
const DAILY: Destination = { id: "daily", mode: DAILY_MODE, title: "29 September 2026", target: { type: "daily", daysBack: 0 } };
const BOOK: Destination = { id: "book", mode: BOOKS_MODE, title: "Book", target: { type: "file", path: "Books/Book.md" } };

function setup(format: Partial<EntryFormat> = {}, other: Partial<CaptureSettings> = {}) {
	const notes = new FakeNotes();
	const attachments = new FakeAttachments();
	const settings: CaptureSettings = { ...DEFAULT_SETTINGS, ...other, defaults: { ...DEFAULT_SETTINGS.defaults, ...format } };
	const service = new CaptureService({
		targets: notes,
		notes,
		attachments,
		clock: { now: () => new Date(2026, 8, 29, 21, 37, 5) },
		settings: () => settings,
	});
	return { notes, attachments, service };
}

const part = (bytes: number[], durationMs = 4000) => ({ data: new Uint8Array(bytes).buffer, durationMs });
const audio = { parts: [part([1, 2])], extension: "m4a", durationMs: 4000 };

describe("CaptureService", () => {
	it("appends formatted text to today's note", async () => {
		const { notes, service } = setup({ textSuffix: " #inbox" });
		await service.captureText(DAILY, "milk");
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk #inbox");
	});

	it("tells which note and line got the text", async () => {
		const { service } = setup();
		expect(await service.captureText(BOOK, "quote")).toEqual({ path: "Books/Book.md", line: 2 });
	});

	it("tells which note and line got the recording", async () => {
		const { notes, service } = setup();
		notes.files.set(NOTE, "- earlier\n");
		expect(await service.captureAudio(DAILY, audio)).toEqual({ path: NOTE, line: 1 });
	});

	it("rejects blank text", async () => {
		const { service } = setup();
		await expect(service.captureText(DAILY, "  \n")).rejects.toBeInstanceOf(CaptureError);
	});

	it("saves audio and embeds it with the audio template", async () => {
		const { notes, attachments, service } = setup({ audioSuffix: " #transcribe" });
		await service.captureAudio(DAILY, audio);
		expect(attachments.saved).toEqual(["Files/Recording 20260929213705.m4a"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 ![[Recording 20260929213705.m4a]] #transcribe");
	});

	it("links audio without embedding when configured", async () => {
		const { notes, service } = setup({}, { embedAudio: false });
		await service.captureAudio(DAILY, audio);
		expect(notes.files.get(NOTE)).toBe("- 21:37 [[Recording 20260929213705.m4a]]");
	});

	it("links audio the way the destination's mode asks", async () => {
		const { notes, service } = setup({}, { embedAudio: true });
		await service.captureAudio({ ...DAILY, mode: { ...DAILY_MODE, audioLink: "link" } }, audio);
		expect(notes.files.get(NOTE)).toBe("- 21:37 [[Recording 20260929213705.m4a]]");
	});

	it("rejects an empty recording without touching files", async () => {
		const { attachments, service } = setup();
		await expect(service.captureAudio(DAILY, { parts: [part([])], extension: "m4a", durationMs: 4000 })).rejects.toThrow(
			"Recording is empty",
		);
		expect(attachments.saved).toEqual([]);
	});

	it("discards the saved file when writing the note fails", async () => {
		const { notes, attachments, service } = setup();
		notes.failWrites = true;
		await expect(service.captureAudio(DAILY, audio)).rejects.toThrow("disk full");
		expect(attachments.discarded).toEqual(["Files/Recording 20260929213705.m4a"]);
	});

	it("puts every part of a split recording on one line, in order", async () => {
		const { notes, attachments, service } = setup({}, { embedAudio: true });
		await service.captureAudio(DAILY, { parts: [part([1]), part([2]), part([3])], extension: "m4a", durationMs: 12000 }, ["idea"]);
		expect(attachments.saved).toEqual([
			"Files/Recording 20260929213705 (1).m4a",
			"Files/Recording 20260929213705 (2).m4a",
			"Files/Recording 20260929213705 (3).m4a",
		]);
		expect(notes.files.get(NOTE)).toBe(
			"- 21:37 ![[Recording 20260929213705 (1).m4a]] ![[Recording 20260929213705 (2).m4a]] ![[Recording 20260929213705 (3).m4a]] #idea",
		);
	});

	it("skips empty parts and keeps the plain name when one part is left", async () => {
		const { attachments, service } = setup();
		await service.captureAudio(DAILY, { parts: [part([1]), part([])], extension: "m4a", durationMs: 4000 });
		expect(attachments.saved).toEqual(["Files/Recording 20260929213705.m4a"]);
	});

	it("discards every saved part when writing the note fails", async () => {
		const { notes, attachments, service } = setup();
		notes.failWrites = true;
		await expect(service.captureAudio(DAILY, { parts: [part([1]), part([2])], extension: "m4a", durationMs: 8000 })).rejects.toThrow();
		expect(attachments.discarded).toEqual(["Files/Recording 20260929213705 (1).m4a", "Files/Recording 20260929213705 (2).m4a"]);
	});

	it("discards the parts saved so far when saving a later part fails", async () => {
		const { notes, attachments, service } = setup();
		attachments.failOnSave = 1;
		await expect(service.captureAudio(DAILY, { parts: [part([1]), part([2])], extension: "m4a", durationMs: 8000 })).rejects.toThrow(
			"vault is read-only",
		);
		expect(attachments.discarded).toEqual(["Files/Recording 20260929213705 (1).m4a"]);
		expect(notes.files.get(NOTE)).toBe("");
	});

	it("treats a recording shorter than half a second as empty", async () => {
		const { attachments, service } = setup();
		await expect(service.captureAudio(DAILY, { ...audio, durationMs: 200 })).rejects.toThrow("Recording is empty");
		expect(attachments.saved).toEqual([]);
	});

	it("drops trailing line breaks and spaces from text", async () => {
		const { notes, service } = setup();
		await service.captureText(DAILY, "milk\n\n  ");
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk");
	});

	it("writes under the configured heading and level, creating it when missing", async () => {
		const { notes, service } = setup({ heading: "Дневник", headingLevel: 3 });
		await service.captureText(DAILY, "first");
		await service.captureText(DAILY, "second");
		expect(notes.files.get(NOTE)).toBe("### Дневник\n\n- 21:37 first\n- 21:37 second");
	});

	it("adds selected tags to a text entry before the suffix", async () => {
		const { notes, service } = setup({ textSuffix: " #inbox" });
		await service.captureText(DAILY, "milk", ["#analyze/нравится"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk #analyze/нравится #inbox");
	});

	it("adds selected tags to an audio entry before the suffix", async () => {
		const { notes, service } = setup({ audioSuffix: " #transcribe" });
		await service.captureAudio(DAILY, audio, ["#idea", "#book"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 ![[Recording 20260929213705.m4a]] #idea #book #transcribe");
	});

	it("writes text to the destination's file with its mode's format", async () => {
		const { notes, service } = setup({ heading: "Дневник" });
		await service.captureText(BOOK, "Рукописи не горят");
		expect(notes.files.get("Books/Book.md")).toBe("## Цитаты\n\n> Рукописи не горят");
		expect(notes.files.has(NOTE)).toBe(false);
	});

	it("saves audio next to the destination's file", async () => {
		const { notes, attachments, service } = setup({ heading: "" });
		await service.captureAudio(BOOK, audio);
		expect(attachments.savedFor).toEqual(["Books/Book.md"]);
		expect(notes.files.get("Books/Book.md")).toBe("## Цитаты\n\n- 21:37 ![[Recording 20260929213705.m4a]]");
	});

	it("refuses a destination without a file before touching anything", async () => {
		const { notes, attachments, service } = setup();
		const noFile: Destination = { ...BOOK, target: { type: "file", path: "" } };
		await expect(service.captureAudio(noFile, audio)).rejects.toBeInstanceOf(TargetError);
		await expect(service.captureText(noFile, "milk")).rejects.toThrow('Choose a file for "Book"');
		expect(attachments.saved).toEqual([]);
		expect(notes.files.size).toBe(0);
	});
});

describe("CaptureService.captureAnswers", () => {
	const text = (value: string): Answer => ({ kind: "text", text: value });
	const voice: Answer = { kind: "audio", recording: audio };

	it("writes one entry with a line per answered question under the mode's heading", async () => {
		const { notes, service } = setup();
		await service.captureAnswers(MORNING, [text("Тяжело, откладывал минут 40"), text("Ничего"), text("Бассейн  \n")], ["#утро"]);
		expect(notes.files.get(NOTE)).toBe(
			[
				"## Утро",
				"",
				"- 21:37 #утро",
				"\t- **Как встал?** Тяжело, откладывал минут 40",
				"\t- **Что тянуло встать?** Ничего",
				"\t- **Что делал утром?** Бассейн",
			].join("\n"),
		);
	});

	it("writes only the answer lines when the mode has no head line, with tags on the first one", async () => {
		const { notes, service } = setup();
		const mode: CaptureMode = { ...MORNING_MODE, headLine: false, overrides: { ...MORNING_MODE.overrides, answerPrefix: "- {{question}} " } };
		await service.captureAnswers({ ...MORNING, mode }, [text("Тяжело"), text(""), text("Бассейн")], ["#утро"]);
		expect(notes.files.get(NOTE)).toBe("## Утро\n\n- Как встал? Тяжело #утро\n- Что делал утром? Бассейн");
	});

	it("leaves out unanswered optional questions", async () => {
		const { notes, service } = setup();
		await service.captureAnswers(MORNING, [text("Тяжело"), text("  "), text("Бассейн")]);
		expect(notes.files.get(NOTE)).toBe("## Утро\n\n- 21:37\n\t- **Как встал?** Тяжело\n\t- **Что делал утром?** Бассейн");
	});

	it("saves a voice answer next to the note and embeds it in the answer line", async () => {
		const { notes, attachments, service } = setup();
		await service.captureAnswers(MORNING, [text("Тяжело"), text(""), voice]);
		expect(attachments.saved).toEqual(["Files/Recording 20260929213705 3.m4a"]);
		expect(notes.files.get(NOTE)).toBe(
			"## Утро\n\n- 21:37\n\t- **Как встал?** Тяжело\n\t- **Что делал утром?** ![[Recording 20260929213705 3.m4a]]",
		);
	});

	it("uses the mode's answer format and audio link choice", async () => {
		const { notes, service } = setup();
		const mode: CaptureMode = { ...MORNING_MODE, audioLink: "link", overrides: { ...MORNING_MODE.overrides, answerPrefix: "  - {{question}} → ", answerSuffix: " ✓" } };
		await service.captureAnswers({ ...MORNING, mode }, [voice]);
		expect(notes.files.get(NOTE)).toBe("## Утро\n\n- 21:37\n  - Как встал? → [[Recording 20260929213705 1.m4a]] ✓");
	});

	it("refuses answers that leave a required question empty", async () => {
		const { notes, service } = setup();
		await expect(service.captureAnswers(MORNING, [text(""), text("Ничего")])).rejects.toThrow('Answer "Как встал?"');
		expect(notes.files.size).toBe(0);
	});

	it("refuses when nothing is answered", async () => {
		const { service } = setup();
		const mode: CaptureMode = { ...MORNING_MODE, questions: [{ text: "Как встал?", required: false }] };
		await expect(service.captureAnswers({ ...MORNING, mode }, [text(" ")])).rejects.toBeInstanceOf(CaptureError);
	});

	it("discards saved voice answers when writing the note fails", async () => {
		const { notes, attachments, service } = setup();
		notes.failWrites = true;
		await expect(service.captureAnswers(MORNING, [voice, text(""), voice])).rejects.toThrow("disk full");
		expect(attachments.discarded).toEqual(attachments.saved);
		expect(attachments.saved).toHaveLength(2);
	});
});
