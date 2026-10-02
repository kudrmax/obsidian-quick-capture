import { AfterSend, CaptureMode, EntryFormat, NO_OVERRIDES } from "./domain/CaptureMode";
import { parseHeading } from "./domain/SectionInserter";

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
	openKeyboardOnMobile: boolean;
	tagGroups: TagGroup[];
	modes: CaptureMode[];
	lastDestinationId: string;
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
	openKeyboardOnMobile: true,
	tagGroups: [],
	modes: [dailyMode([])],
	lastDestinationId: DAILY_MODE_ID,
};

interface LegacySettings extends Omit<EntryFormat, "headingLevel"> {
	embedAudio: boolean;
	afterSend: AfterSend;
	tagGroups: Omit<TagGroup, "id">[];
}

export function loadSettings(saved: unknown): CaptureSettings {
	const data = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
	const settings = "modes" in data ? migrateModes(data) : migrateLegacy(data as Partial<LegacySettings>);
	return structuredClone(settings);
}

type SavedMode = Omit<CaptureMode, "afterSend"> & Partial<Pick<CaptureMode, "afterSend">>;
type SingleFileMode = Omit<SavedMode, "target"> & { target: { type: "file"; path: string } };

interface SavedSettings extends Omit<CaptureSettings, "modes"> {
	modes: (SavedMode | SingleFileMode)[];
	lastModeId?: string;
}

function migrateModes(data: Record<string, unknown>): CaptureSettings {
	const saved = data as Partial<SavedSettings>;
	const { lastModeId, modes, ...rest } = { ...DEFAULT_SETTINGS, ...saved } as SavedSettings;
	return {
		...rest,
		modes: modes.map((mode) => ({ afterSend: "default", ...toFilesMode(mode) })),
		lastDestinationId: saved.lastDestinationId ?? lastModeId ?? DAILY_MODE_ID,
	};
}

function toFilesMode(mode: SavedMode | SingleFileMode): SavedMode {
	if (mode.target.type !== "file") return mode as SavedMode;
	const file = { id: mode.id, alias: mode.title, path: mode.target.path, lastUsedAt: 0 };
	return { ...mode, target: { type: "files", files: [file] } };
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
		openKeyboardOnMobile: DEFAULT_SETTINGS.openKeyboardOnMobile,
		tagGroups,
		modes: [dailyMode(tagGroups.map((group) => group.id))],
		lastDestinationId: DAILY_MODE_ID,
	};
}

function pickFormat(legacy: Partial<LegacySettings>): Partial<EntryFormat> {
	const keys = ["heading", "textPrefix", "textSuffix", "audioPrefix", "audioSuffix"] as const;
	return Object.fromEntries(keys.filter((key) => typeof legacy[key] === "string").map((key) => [key, legacy[key]]));
}

function dailyMode(tagGroupIds: string[]): CaptureMode {
	return { id: DAILY_MODE_ID, title: "", target: { type: "daily" }, overrides: { ...NO_OVERRIDES }, afterSend: "default", tagGroupIds };
}
