import { describe, expect, it } from "vitest";
import {
	CaptureMode,
	destinationProblem,
	EntryFormat,
	listDestinations,
	markUsed,
	ModeFile,
	modeTagGroups,
	NO_OVERRIDES,
	pickDestination,
	resolveFormat,
	retainTags,
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

function file(id: string, path: string, alias = "", lastUsedAt = 0): ModeFile {
	return { id, alias, path, lastUsedAt };
}

function filesMode(id: string, files: ModeFile[]): CaptureMode {
	return mode({ id, title: "Книги", target: { type: "files", files } });
}

const TODAY = "30 September 2026";

describe("listDestinations", () => {
	it("lists a daily mode as one destination titled with today's date", () => {
		expect(listDestinations([mode({ id: "daily" })], TODAY)).toMatchObject([
			{ id: "daily", title: TODAY, target: { type: "daily" } },
		]);
	});

	it("titles a daily mode with its own title", () => {
		expect(listDestinations([mode({ title: " Дневник " })], TODAY)[0].title).toBe("Дневник");
	});

	it("lists every file of a files mode flat, after the modes before it", () => {
		const books = filesMode("books", [file("a", "Reading/Мастер и Маргарита.md", "Мастер"), file("b", "Library/Сапиенс.md")]);
		const list = listDestinations([mode({ id: "daily" }), books], TODAY);
		expect(list.map((d) => [d.id, d.title])).toEqual([
			["daily", TODAY],
			["a", "Мастер"],
			["b", "Сапиенс"],
		]);
		expect(list[1].mode).toBe(books);
		expect(list[1].target).toEqual({ type: "file", path: "Reading/Мастер и Маргарита.md" });
	});

	it("puts the most recently used files of a mode first and never used ones after them in settings order", () => {
		const books = filesMode("books", [file("a", "A.md", "", 0), file("b", "B.md", "", 5), file("c", "C.md", "", 0), file("d", "D.md", "", 9)]);
		expect(listDestinations([books], TODAY).map((d) => d.id)).toEqual(["d", "b", "a", "c"]);
	});

	it("skips files without a markdown path", () => {
		const books = filesMode("books", [file("a", " "), file("b", "x.txt"), file("c", "C.md")]);
		expect(listDestinations([books], TODAY).map((d) => d.id)).toEqual(["c"]);
	});

	it("gives nothing for a files mode without files", () => {
		expect(listDestinations([filesMode("books", [])], TODAY)).toEqual([]);
	});
});

describe("pickDestination", () => {
	const list = listDestinations([mode({ id: "daily" }), filesMode("books", [file("a", "A.md")])], TODAY);

	it("finds the destination by id", () => {
		expect(pickDestination(list, "a")?.id).toBe("a");
	});

	it("falls back to the first destination for an unknown id", () => {
		expect(pickDestination(list, "deleted")?.id).toBe("daily");
	});

	it("has nothing to pick from an empty list", () => {
		expect(pickDestination([], "a")).toBeUndefined();
	});
});

describe("markUsed", () => {
	it("stamps the file that was written to", () => {
		const books = filesMode("books", [file("a", "A.md"), file("b", "B.md")]);
		expect(markUsed([mode(), books], "b", 42)).toBe(true);
		expect(books.target.type === "files" && books.target.files.map((f) => f.lastUsedAt)).toEqual([0, 42]);
	});

	it("changes nothing for a daily destination", () => {
		expect(markUsed([mode({ id: "daily" })], "daily", 42)).toBe(false);
	});
});

describe("destinationProblem", () => {
	it("accepts the daily note and a markdown file", () => {
		const [daily, book] = listDestinations([mode({ id: "daily" }), filesMode("books", [file("a", "A.md")])], TODAY);
		expect(destinationProblem(daily)).toBeNull();
		expect(destinationProblem(book)).toBeNull();
	});

	it("asks to choose a file when the path is not a note", () => {
		const books = filesMode("books", [file("a", "A.md", "Мастер")]);
		const [book] = listDestinations([books], TODAY);
		expect(destinationProblem({ ...book, target: { type: "file", path: "a.txt" } })).toBe('Choose a file for "Мастер"');
	});
});

describe("retainTags", () => {
	it("keeps only tags offered by the groups", () => {
		const groups = [{ tags: [{ tag: " #like " }, { tag: "#idea" }] }];
		expect(retainTags(["#like", "#quote"], groups)).toEqual(["#like"]);
	});
});
