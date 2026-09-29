import { describe, expect, it } from "vitest";
import { IconSearch } from "../src/domain/IconSearch";

const search = new IconSearch(
	["heart", "thumbs-up", "thumbs-down", "star", "circle-star", "align-start-vertical", "smile", "gallery-thumbnails"],
	{ "thumbs-up": ["like", "good"], heart: ["like", "love"], smile: ["emotion", "happy"], star: ["favorite"] },
);

describe("IconSearch", () => {
	it("finds icons by their keywords", () => {
		expect(search.find("like")).toEqual(["heart", "thumbs-up"]);
	});

	it("ranks an exact name before names that only contain the query", () => {
		expect(search.find("star")).toEqual(["star", "circle-star", "align-start-vertical"]);
	});

	it("ranks a name prefix before a word prefix inside a name", () => {
		expect(search.find("thumb")).toEqual(["thumbs-down", "thumbs-up", "gallery-thumbnails"]);
	});

	it("finds icons by a keyword prefix", () => {
		expect(search.find("fav")).toEqual(["star"]);
	});

	it("ignores case and surrounding spaces", () => {
		expect(search.find("  HAPPY ")).toEqual(["smile"]);
	});

	it("lists every icon for an empty query", () => {
		expect(search.find("")).toHaveLength(8);
	});

	it("ranks icons whose keyword comes first before icons that list it later", () => {
		const books = new IconSearch(["book-heart", "thumbs-up", "hand-heart"], {
			"book-heart": ["reading", "like"],
			"thumbs-up": ["like", "good"],
			"hand-heart": ["care", "like"],
		});
		expect(books.find("like")).toEqual(["thumbs-up", "book-heart", "hand-heart"]);
	});
});
