import { describe, expect, it } from "vitest";
import { CaptureError, CaptureService, TargetError } from "../src/application/CaptureService";
import { AttachmentStore, NoteTargets, NoteWriter } from "../src/application/ports";
import { CaptureMode, Destination, EntryFormat, NO_OVERRIDES, NoteTarget } from "../src/domain/CaptureMode";
import { CaptureSettings, DEFAULT_SETTINGS } from "../src/settings";

const NOTE = "Daily/2026-09-29.md";

class FakeNotes implements NoteTargets, NoteWriter {
	files = new Map<string, string>();
	failWrites = false;

	async resolve(target: NoteTarget): Promise<string | null> {
		const path = target.type === "daily" ? NOTE : target.path;
		if (target.type === "file" && target.mustExist && !this.files.has(path)) return null;
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

	async save(fileName: string, _data: ArrayBuffer, notePath: string) {
		const path = `Files/${fileName}`;
		this.saved.push(path);
		this.savedFor.push(notePath);
		return { path, link: `[[${fileName}]]` };
	}

	async discard(path: string) {
		this.discarded.push(path);
	}
}

const DAILY_MODE: CaptureMode = { id: "daily", title: "", target: { type: "daily" }, overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default", tagGroupIds: [] };
const BOOKS_MODE: CaptureMode = {
	id: "books",
	title: "Книги",
	target: { type: "files", files: [{ id: "book", alias: "Book", path: "Books/Book.md", lastUsedAt: 0 }] },
	overrides: { ...NO_OVERRIDES, heading: "Цитаты", textPrefix: "> " }, afterSend: "default", audioLink: "default",
	tagGroupIds: [],
};
const DAILY: Destination = { id: "daily", mode: DAILY_MODE, title: "29 September 2026", target: { type: "daily" } };
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

const audio = { data: new Uint8Array([1, 2]).buffer, extension: "m4a", durationMs: 4000 };

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
		await expect(service.captureAudio(DAILY, { data: new ArrayBuffer(0), extension: "m4a", durationMs: 4000 })).rejects.toThrow(
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

	it("refuses a file that was written to before and has disappeared instead of creating it again", async () => {
		const { notes, attachments, service } = setup();
		const gone: Destination = { ...BOOK, target: { type: "file", path: "Books/Book.md", mustExist: true } };
		await expect(service.captureAudio(gone, audio)).rejects.toBeInstanceOf(TargetError);
		await expect(service.captureText(gone, "milk")).rejects.toThrow('"Book" is no longer in the vault');
		expect(attachments.saved).toEqual([]);
		expect(notes.files.size).toBe(0);
	});
});
