import { describe, expect, it } from "vitest";
import { tagSections } from "../src/ui/TagPicker";

const group = (id: string, name: string, tags: string[]) => ({ id, name, tags: tags.map((tag) => ({ tag, icon: "" })) });

describe("tagSections", () => {
	it("hides the name when the mode shows only one group", () => {
		expect(tagSections([group("a", "Daily", ["#like", "#dislike"])])).toEqual([
			{ name: null, tags: [{ tag: "#like", icon: "" }, { tag: "#dislike", icon: "" }] },
		]);
	});

	it("names every group when there are several", () => {
		expect(tagSections([group("a", "Daily", ["#like"]), group("b", "Books", ["#quote"])]).map((s) => s.name)).toEqual(["Daily", "Books"]);
	});

	it("does not count groups without tags", () => {
		expect(tagSections([group("a", "Daily", ["#like"]), group("b", "Empty", [" "])])).toEqual([
			{ name: null, tags: [{ tag: "#like", icon: "" }] },
		]);
	});

	it("leaves an unnamed group without a name", () => {
		expect(tagSections([group("a", " ", ["#like"]), group("b", "Books", ["#quote"])]).map((s) => s.name)).toEqual([null, "Books"]);
	});
});
