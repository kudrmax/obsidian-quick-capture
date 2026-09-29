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

export type ModeTarget = { type: "daily" } | { type: "file"; path: string };

export interface CaptureMode {
	id: string;
	title: string;
	target: ModeTarget;
	overrides: FormatOverrides;
	tagGroupIds: string[];
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

export function modeTagGroups<G extends { id: string }>(groups: G[], mode: CaptureMode): G[] {
	return groups.filter((group) => mode.tagGroupIds.includes(group.id));
}

export function pickMode(modes: CaptureMode[], id: string): CaptureMode {
	return modes.find((mode) => mode.id === id) ?? modes[0];
}

export function modeTitle(mode: CaptureMode, today: string): string {
	const title = mode.title.trim();
	if (title !== "") return title;
	return mode.target.type === "daily" ? today : "Untitled mode";
}

export function targetProblem(mode: CaptureMode): string | null {
	if (mode.target.type === "daily") return null;
	if (/\.md$/i.test(mode.target.path.trim())) return null;
	return `Choose a file for mode "${modeTitle(mode, "Daily note")}"`;
}

export function retainTags(selected: Iterable<string>, groups: { tags: { tag: string }[] }[]): string[] {
	const offered = new Set(groups.flatMap((group) => group.tags.map((quickTag) => quickTag.tag.trim())));
	return [...selected].filter((tag) => offered.has(tag.trim()));
}
