import { describe, expect, it } from "vitest";
import { dailyNotePath, renderDailyTemplate } from "../src/domain/DailyNoteTemplate";

const date = new Date(2026, 8, 29, 7, 4);
const fmt = (d: Date, f: string) =>
	f
		.replaceAll("YYYY", String(d.getFullYear()))
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
		expect(renderDailyTemplate(template, "2026-09-29", date, fmt, "YYYY-MM-DD")).toBe("# 2026-09-29\n2026-09-29 07:04 2026 07");
	});

	it("formats a bare {{date}} with the daily note format", () => {
		expect(renderDailyTemplate("{{date}}", "29.09.2026", date, fmt, "DD.MM.YYYY")).toBe("29.09.2026");
	});
});
