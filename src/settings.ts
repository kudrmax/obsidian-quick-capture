export type AfterSend = "close" | "stay";

export interface QuickTag {
	tag: string;
	icon: string;
}

export interface TagGroup {
	name: string;
	tags: QuickTag[];
}

export interface CaptureSettings {
	heading: string;
	textPrefix: string;
	textSuffix: string;
	audioPrefix: string;
	audioSuffix: string;
	embedAudio: boolean;
	afterSend: AfterSend;
	tagGroups: TagGroup[];
}

export const DEFAULT_SETTINGS: CaptureSettings = {
	heading: "",
	textPrefix: "- {{time}} ",
	textSuffix: "",
	audioPrefix: "- {{time}} ",
	audioSuffix: "",
	embedAudio: true,
	afterSend: "close",
	tagGroups: [],
};

export function loadSettings(saved: unknown): CaptureSettings {
	const merged: CaptureSettings = { ...DEFAULT_SETTINGS, ...(typeof saved === "object" ? saved : {}) };
	return { ...merged, tagGroups: structuredClone(merged.tagGroups) };
}
