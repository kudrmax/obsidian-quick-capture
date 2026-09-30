import { CaptureMode, EntryFormat, noteName, resolveFormat, ResolvedFormat } from "./CaptureMode";
import { Clock } from "./Clock";
import { EntryFormatter } from "./EntryFormatter";

const SAMPLE_TEXT = "Your text";
const SAMPLE_RECORDING = "[[Recording.m4a]]";

export interface EntryPreview {
	heading: string | null;
	text: string;
	audio: string;
}

export function previewEntries(format: ResolvedFormat, embedAudio: boolean, clock: Clock, sampleTag = ""): EntryPreview {
	const formatter = new EntryFormatter(clock);
	const tags = [sampleTag];
	return {
		heading: format.heading ? `${"#".repeat(format.heading.level)} ${format.heading.text}` : null,
		text: formatter.format(format.text, SAMPLE_TEXT, tags),
		audio: formatter.format(format.audio, `${embedAudio ? "!" : ""}${SAMPLE_RECORDING}`, tags),
	};
}

export function modeSummary(mode: CaptureMode, defaults: EntryFormat): string {
	const heading = resolveFormat(defaults, mode.overrides).heading;
	return `${targetSummary(mode)} · ${heading ? `under “${heading.text}”` : "end of note"}`;
}

function targetSummary(mode: CaptureMode): string {
	if (mode.target.type === "daily") return "Daily note";
	const files = mode.target.files.filter((file) => file.path.trim() !== "");
	if (files.length === 0) return "No file yet";
	if (files.length === 1) return files[0].alias.trim() || noteName(files[0].path);
	return `${files.length} files`;
}
