import { describe, expect, it } from "vitest";
import { CaptureMode, EntryFormat, NO_OVERRIDES, resolveFormat } from "../src/domain/CaptureMode";
import { modeSummary, previewEntries } from "../src/domain/SettingsPreview";

const clock = { now: () => new Date(2026, 8, 30, 21, 37) };
const DEFAULTS: EntryFormat = {
	heading: "Journal",
	headingLevel: 2,
	textPrefix: "- {{time}} ",
	textSuffix: "",
	audioPrefix: "- {{date}} ",
	audioSuffix: " #transcribe",
};

function mode(target: CaptureMode["target"], overrides = NO_OVERRIDES): CaptureMode {
	return { id: "m", title: "", target, overrides, afterSend: "default", tagGroupIds: [] };
}

const file = (alias: string, path: string) => ({ id: path, alias, path, lastUsedAt: 0 });

describe("previewEntries", () => {
	it("shows the heading line and both entries the way they are written", () => {
		expect(previewEntries(resolveFormat(DEFAULTS, NO_OVERRIDES), true, clock)).toEqual({
			heading: "## Journal",
			text: "- 21:37 Your text",
			audio: "- 2026-09-30 ![[Recording.m4a]] #transcribe",
		});
	});

	it("links audio without embedding and has no heading line when entries go to the end of the note", () => {
		const format = resolveFormat(DEFAULTS, { ...NO_OVERRIDES, headingLevel: "none" });
		const preview = previewEntries(format, false, clock);
		expect(preview.heading).toBeNull();
		expect(preview.audio).toBe("- 2026-09-30 [[Recording.m4a]] #transcribe");
	});

	it("puts a sample tag before the suffix", () => {
		const preview = previewEntries(resolveFormat(DEFAULTS, NO_OVERRIDES), true, clock, "#like");
		expect(preview.text).toBe("- 21:37 Your text #like");
		expect(preview.audio).toBe("- 2026-09-30 ![[Recording.m4a]] #like #transcribe");
	});
});

describe("modeSummary", () => {
	it("names the daily note and the inherited heading", () => {
		expect(modeSummary(mode({ type: "daily" }), DEFAULTS)).toBe("Daily note · under “Journal”");
	});

	it("names a single file by its alias, or by its note name without one", () => {
		expect(modeSummary(mode({ type: "files", files: [file("Book", "Books/M.md")] }), DEFAULTS)).toBe("Book · under “Journal”");
		expect(modeSummary(mode({ type: "files", files: [file("", "Books/M.md")] }), DEFAULTS)).toBe("M · under “Journal”");
	});

	it("counts several files and skips rows without a path", () => {
		const files = [file("", "A.md"), file("", "B.md"), file("x", " ")];
		expect(modeSummary(mode({ type: "files", files }), DEFAULTS)).toBe("2 files · under “Journal”");
	});

	it("says when a files mode has no file yet", () => {
		expect(modeSummary(mode({ type: "files", files: [file("", "")] }), DEFAULTS)).toBe("No file yet · under “Journal”");
	});

	it("says end of note when the mode has no heading", () => {
		const overrides = { ...NO_OVERRIDES, headingLevel: "none" as const };
		expect(modeSummary(mode({ type: "daily" }, overrides), DEFAULTS)).toBe("Daily note · end of note");
		expect(modeSummary(mode({ type: "daily" }), { ...DEFAULTS, heading: "" })).toBe("Daily note · end of note");
	});

	it("uses the mode's own heading over the default", () => {
		expect(modeSummary(mode({ type: "daily" }, { ...NO_OVERRIDES, heading: "Дневник" }), DEFAULTS)).toBe("Daily note · under “Дневник”");
	});
});
