import { describe, expect, it } from "vitest";
import { CaptureError, CaptureService } from "../src/application/CaptureService";
import { AttachmentStore, DailyNoteGateway, NoteWriter } from "../src/application/ports";
import { CaptureSettings, DEFAULT_SETTINGS } from "../src/settings";

const NOTE = "Daily/2026-09-29.md";

class FakeNotes implements DailyNoteGateway, NoteWriter {
	files = new Map<string, string>();
	failWrites = false;

	async getOrCreateToday(): Promise<string> {
		if (!this.files.has(NOTE)) this.files.set(NOTE, "");
		return NOTE;
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
	const settings = { ...DEFAULT_SETTINGS, ...overrides };
	const service = new CaptureService({
		dailyNotes: notes,
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
		await service.captureText("milk");
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk #inbox");
	});

	it("rejects blank text", async () => {
		const { service } = setup();
		await expect(service.captureText("  \n")).rejects.toBeInstanceOf(CaptureError);
	});

	it("saves audio and embeds it with the audio template", async () => {
		const { notes, attachments, service } = setup({ audioSuffix: " #transcribe" });
		await service.captureAudio(audio);
		expect(attachments.saved).toEqual(["Files/Recording 20260929213705.m4a"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 ![[Recording 20260929213705.m4a]] #transcribe");
	});

	it("links audio without embedding when configured", async () => {
		const { notes, service } = setup({ embedAudio: false });
		await service.captureAudio(audio);
		expect(notes.files.get(NOTE)).toBe("- 21:37 [[Recording 20260929213705.m4a]]");
	});

	it("rejects an empty recording without touching files", async () => {
		const { attachments, service } = setup();
		await expect(service.captureAudio({ data: new ArrayBuffer(0), extension: "m4a", durationMs: 4000 })).rejects.toThrow("Recording is empty");
		expect(attachments.saved).toEqual([]);
	});

	it("discards the saved file when writing the note fails", async () => {
		const { notes, attachments, service } = setup();
		notes.failWrites = true;
		await expect(service.captureAudio(audio)).rejects.toThrow("disk full");
		expect(attachments.discarded).toEqual(["Files/Recording 20260929213705.m4a"]);
	});

	it("treats a recording shorter than half a second as empty", async () => {
		const { attachments, service } = setup();
		await expect(service.captureAudio({ ...audio, durationMs: 200 })).rejects.toThrow("Recording is empty");
		expect(attachments.saved).toEqual([]);
	});

	it("drops trailing line breaks and spaces from text", async () => {
		const { notes, service } = setup();
		await service.captureText("milk\n\n  ");
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk");
	});

	it("writes under the configured heading, creating it when missing", async () => {
		const { notes, service } = setup({ heading: "### Дневник" });
		await service.captureText("first");
		await service.captureText("second");
		expect(notes.files.get(NOTE)).toBe("### Дневник\n\n- 21:37 first\n- 21:37 second");
	});

	it("adds selected tags to a text entry before the suffix", async () => {
		const { notes, service } = setup({ textSuffix: " #inbox" });
		await service.captureText("milk", ["#analyze/нравится"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 milk #analyze/нравится #inbox");
	});

	it("adds selected tags to an audio entry before the suffix", async () => {
		const { notes, service } = setup({ audioSuffix: " #transcribe" });
		await service.captureAudio(audio, ["#idea", "#book"]);
		expect(notes.files.get(NOTE)).toBe("- 21:37 ![[Recording 20260929213705.m4a]] #idea #book #transcribe");
	});
});
