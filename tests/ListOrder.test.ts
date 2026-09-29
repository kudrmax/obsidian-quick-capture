import { describe, expect, it } from "vitest";
import { moveItem } from "../src/domain/ListOrder";

describe("moveItem", () => {
	it("moves an item up", () => {
		const list = ["a", "b", "c"];
		moveItem(list, 2, -1);
		expect(list).toEqual(["a", "c", "b"]);
	});

	it("moves an item down", () => {
		const list = ["a", "b", "c"];
		moveItem(list, 0, 1);
		expect(list).toEqual(["b", "a", "c"]);
	});

	it("keeps the list when the item is already at the edge", () => {
		const list = ["a", "b"];
		moveItem(list, 0, -1);
		moveItem(list, 1, 1);
		expect(list).toEqual(["a", "b"]);
	});
});
