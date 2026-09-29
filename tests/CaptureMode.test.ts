import { describe, expect, it } from "vitest";
import {
	CaptureMode,
	EntryFormat,
	modeTagGroups,
	modeTitle,
	NO_OVERRIDES,
	pickMode,
	resolveFormat,
	retainTags,
	targetProblem,
} from "../src/domain/CaptureMode";

const DEFAULTS: EntryFormat = {
	heading: "Дневник",
	headingLevel: 2,
	textPrefix: "- {{time}} ",
	textSuffix: "",
	audioPrefix: "- {{time}} ",
	audioSuffix: " #transcribe",
};

function mode(overrides: Partial<CaptureMode> = {}): CaptureMode {
	return { id: "m", title: "", target: { type: "daily" }, overrides: { ...NO_OVERRIDES }, tagGroupIds: [], ...overrides };
}

describe("resolveFormat", () => {
	it("inherits every default when nothing is overridden", () => {
		expect(resolveFormat(DEFAULTS, NO_OVERRIDES)).toEqual({
			heading: { text: "Дневник", level: 2 },
			text: { prefix: "- {{time}} ", suffix: "" },
			audio: { prefix: "- {{time}} ", suffix: " #transcribe" },
		});
	});

	it("uses the mode's own values where they are filled in", () => {
		const format = resolveFormat(DEFAULTS, { ...NO_OVERRIDES, heading: "Цитаты", textPrefix: "> ", audioSuffix: " #book" });
		expect(format.heading).toEqual({ text: "Цитаты", level: 2 });
		expect(format.text).toEqual({ prefix: "> ", suffix: "" });
		expect(format.audio).toEqual({ prefix: "- {{time}} ", suffix: " #book" });
	});

	it("overrides only the heading level", () => {
		expect(resolveFormat(DEFAULTS, { ...NO_OVERRIDES, headingLevel: 4 }).heading).toEqual({ text: "Дневник", level: 4 });
	});

	it("writes to the end of the note when the mode says no heading", () => {
		expect(resolveFormat(DEFAULTS, { ...NO_OVERRIDES, headingLevel: "none" }).heading).toBeNull();
	});

	it("writes to the end of the note when the default heading is empty", () => {
		expect(resolveFormat({ ...DEFAULTS, heading: " " }, NO_OVERRIDES).heading).toBeNull();
	});

	it("lets hashes in the heading text set the level", () => {
		expect(resolveFormat({ ...DEFAULTS, heading: "### Дневник" }, NO_OVERRIDES).heading).toEqual({ text: "Дневник", level: 3 });
	});
});

describe("modeTagGroups", () => {
	const groups = [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
	];

	it("keeps only the mode's groups in settings order", () => {
		expect(modeTagGroups(groups, mode({ tagGroupIds: ["c", "a"] })).map((g) => g.id)).toEqual(["a", "c"]);
	});

	it("ignores groups that no longer exist", () => {
		expect(modeTagGroups(groups, mode({ tagGroupIds: ["gone", "b"] })).map((g) => g.id)).toEqual(["b"]);
	});
});

describe("pickMode", () => {
	const modes = [mode({ id: "daily" }), mode({ id: "book" })];

	it("finds the mode by id", () => {
		expect(pickMode(modes, "book").id).toBe("book");
	});

	it("falls back to the first mode for an unknown id", () => {
		expect(pickMode(modes, "deleted").id).toBe("daily");
	});
});

describe("targetProblem", () => {
	it("accepts the daily note", () => {
		expect(targetProblem(mode())).toBeNull();
	});

	it("asks to choose a file when the path is empty or not a note", () => {
		expect(targetProblem(mode({ title: "Books", target: { type: "file", path: " " } }))).toBe('Choose a file for mode "Books"');
		expect(targetProblem(mode({ title: "Books", target: { type: "file", path: "a.txt" } }))).toBe('Choose a file for mode "Books"');
	});

	it("accepts a markdown file", () => {
		expect(targetProblem(mode({ target: { type: "file", path: "Books/X.md" } }))).toBeNull();
	});
});

describe("modeTitle", () => {
	it("shows today's date for a daily mode without a title", () => {
		expect(modeTitle(mode(), "30 September 2026")).toBe("30 September 2026");
	});

	it("shows the mode's own title", () => {
		expect(modeTitle(mode({ title: " Идеи " }), "30 September 2026")).toBe("Идеи");
	});

	it("names an untitled file mode", () => {
		expect(modeTitle(mode({ target: { type: "file", path: "X.md" } }), "30 September 2026")).toBe("Untitled mode");
	});
});

describe("retainTags", () => {
	it("keeps only tags offered by the groups", () => {
		const groups = [{ tags: [{ tag: " #like " }, { tag: "#idea" }] }];
		expect(retainTags(["#like", "#quote"], groups)).toEqual(["#like"]);
	});
});
