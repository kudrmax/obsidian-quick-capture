import { EntryTemplate } from "./EntryFormatter";
import { HeadingTarget, parseHeading } from "./SectionInserter";

export interface EntryFormat {
	heading: string;
	headingLevel: number;
	textPrefix: string;
	textSuffix: string;
	audioPrefix: string;
	audioSuffix: string;
}

export type HeadingLevelChoice = "default" | "none" | number;

export interface FormatOverrides {
	heading: string;
	headingLevel: HeadingLevelChoice;
	textPrefix: string;
	textSuffix: string;
	audioPrefix: string;
	audioSuffix: string;
}

export type AfterSend = "close" | "stay" | "open";

export type AfterSendChoice = "default" | AfterSend;

export type NoteTarget = { type: "daily" } | { type: "file"; path: string };

export interface ModeFile {
	id: string;
	alias: string;
	path: string;
	lastUsedAt: number;
}

export type ModeTarget = { type: "daily" } | { type: "files"; files: ModeFile[] };

export interface CaptureMode {
	id: string;
	title: string;
	target: ModeTarget;
	overrides: FormatOverrides;
	afterSend: AfterSendChoice;
	tagGroupIds: string[];
}

export interface Destination {
	id: string;
	mode: CaptureMode;
	title: string;
	target: NoteTarget;
}

export interface ResolvedFormat {
	heading: HeadingTarget | null;
	text: EntryTemplate;
	audio: EntryTemplate;
}

export const NO_OVERRIDES: FormatOverrides = {
	heading: "",
	headingLevel: "default",
	textPrefix: "",
	textSuffix: "",
	audioPrefix: "",
	audioSuffix: "",
};

export function resolveFormat(defaults: EntryFormat, overrides: FormatOverrides): ResolvedFormat {
	const pick = (own: string, inherited: string) => (own === "" ? inherited : own);
	const level = overrides.headingLevel;
	const heading =
		level === "none"
			? null
			: parseHeading(pick(overrides.heading, defaults.heading), level === "default" ? defaults.headingLevel : level);
	return {
		heading: heading && typeof level === "number" ? { ...heading, level } : heading,
		text: { prefix: pick(overrides.textPrefix, defaults.textPrefix), suffix: pick(overrides.textSuffix, defaults.textSuffix) },
		audio: {
			prefix: pick(overrides.audioPrefix, defaults.audioPrefix),
			suffix: pick(overrides.audioSuffix, defaults.audioSuffix),
		},
	};
}

export function resolveAfterSend(defaultChoice: AfterSend, mode: CaptureMode): AfterSend {
	return mode.afterSend === "default" ? defaultChoice : mode.afterSend;
}

export function modeTagGroups<G extends { id: string }>(groups: G[], mode: CaptureMode): G[] {
	return groups.filter((group) => mode.tagGroupIds.includes(group.id));
}

export function listDestinations(modes: CaptureMode[], today: string): Destination[] {
	return modes.flatMap((mode): Destination[] => {
		if (mode.target.type === "daily") {
			return [{ id: mode.id, mode, title: mode.title.trim() || today, target: { type: "daily" } }];
		}
		return byLastUse(mode.target.files.filter((file) => isNotePath(file.path))).map((file) => ({
			id: file.id,
			mode,
			title: file.alias.trim() || noteName(file.path),
			target: { type: "file", path: file.path.trim() },
		}));
	});
}

export function pickDestination(destinations: Destination[], id: string): Destination | undefined {
	return destinations.find((destination) => destination.id === id) ?? destinations[0];
}

export function markUsed(modes: CaptureMode[], destinationId: string, at: number): boolean {
	for (const mode of modes) {
		if (mode.target.type !== "files") continue;
		const file = mode.target.files.find((candidate) => candidate.id === destinationId);
		if (file) {
			file.lastUsedAt = at;
			return true;
		}
	}
	return false;
}

export function destinationProblem(destination: Destination): string | null {
	if (destination.target.type === "daily" || isNotePath(destination.target.path)) return null;
	return `Choose a file for "${destination.title}"`;
}

function byLastUse(files: ModeFile[]): ModeFile[] {
	return [...files].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function isNotePath(path: string): boolean {
	return /\.md$/i.test(path.trim());
}

export function noteName(path: string): string {
	return (path.trim().split("/").pop() ?? "").replace(/\.md$/i, "");
}

export function retainTags(selected: Iterable<string>, groups: { tags: { tag: string }[] }[]): string[] {
	const offered = new Set(groups.flatMap((group) => group.tags.map((quickTag) => quickTag.tag.trim())));
	return [...selected].filter((tag) => offered.has(tag.trim()));
}
