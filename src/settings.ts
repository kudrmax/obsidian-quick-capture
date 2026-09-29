import { CaptureMode, EntryFormat, NO_OVERRIDES } from "./domain/CaptureMode";
import { parseHeading } from "./domain/SectionInserter";

export type AfterSend = "close" | "stay";

export interface QuickTag {
	tag: string;
	icon: string;
}

export interface TagGroup {
	id: string;
	name: string;
	tags: QuickTag[];
}

export interface CaptureSettings {
	defaults: EntryFormat;
	embedAudio: boolean;
	afterSend: AfterSend;
	tagGroups: TagGroup[];
	modes: CaptureMode[];
	lastModeId: string;
}

const DAILY_MODE_ID = "daily";
const DEFAULT_HEADING_LEVEL = 2;

export const DEFAULT_SETTINGS: CaptureSettings = {
	defaults: {
		heading: "",
		headingLevel: DEFAULT_HEADING_LEVEL,
		textPrefix: "- {{time}} ",
		textSuffix: "",
		audioPrefix: "- {{time}} ",
		audioSuffix: "",
	},
	embedAudio: true,
	afterSend: "close",
	tagGroups: [],
	modes: [dailyMode([])],
	lastModeId: DAILY_MODE_ID,
};

interface LegacySettings extends Omit<EntryFormat, "headingLevel"> {
	embedAudio: boolean;
	afterSend: AfterSend;
	tagGroups: Omit<TagGroup, "id">[];
}

export function loadSettings(saved: unknown): CaptureSettings {
	const data = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
	const settings = "modes" in data ? { ...DEFAULT_SETTINGS, ...data } : migrateLegacy(data as Partial<LegacySettings>);
	return structuredClone(settings as CaptureSettings);
}

let idCounter = 0;

export function newId(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	idCounter += 1;
	return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function migrateLegacy(legacy: Partial<LegacySettings>): CaptureSettings {
	const format = { ...DEFAULT_SETTINGS.defaults, ...pickFormat(legacy) };
	const heading = parseHeading(format.heading, DEFAULT_HEADING_LEVEL);
	const tagGroups = (legacy.tagGroups ?? []).map((group, index) => ({ id: `group-${index + 1}`, ...group }));
	return {
		defaults: { ...format, heading: heading?.text ?? "", headingLevel: heading?.level ?? DEFAULT_HEADING_LEVEL },
		embedAudio: legacy.embedAudio ?? DEFAULT_SETTINGS.embedAudio,
		afterSend: legacy.afterSend ?? DEFAULT_SETTINGS.afterSend,
		tagGroups,
		modes: [dailyMode(tagGroups.map((group) => group.id))],
		lastModeId: DAILY_MODE_ID,
	};
}

function pickFormat(legacy: Partial<LegacySettings>): Partial<EntryFormat> {
	const keys = ["heading", "textPrefix", "textSuffix", "audioPrefix", "audioSuffix"] as const;
	return Object.fromEntries(keys.filter((key) => typeof legacy[key] === "string").map((key) => [key, legacy[key]]));
}

function dailyMode(tagGroupIds: string[]): CaptureMode {
	return { id: DAILY_MODE_ID, title: "", target: { type: "daily" }, overrides: { ...NO_OVERRIDES }, tagGroupIds };
}
