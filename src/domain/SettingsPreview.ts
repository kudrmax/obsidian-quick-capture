import { askedQuestions, CaptureMode, EntryFormat, noteName, resolveFormat, ResolvedFormat } from "./CaptureMode";
import { Clock } from "./Clock";
import { AnswerEntry } from "./AnswerEntry";
import { EntryFormatter } from "./EntryFormatter";

const SAMPLE_TEXT = "Your text";
const SAMPLE_RECORDING = "[[Recording.m4a]]";

export interface EntryPreview {
	heading: string | null;
	text: string;
	audio: string;
	answers: string[];
}

export function previewEntries(
	format: ResolvedFormat,
	embedAudio: boolean,
	clock: Clock,
	sampleTag = "",
	questions: readonly string[] = [],
	headLine = true,
): EntryPreview {
	const formatter = new EntryFormatter(clock);
	const tags = [sampleTag];
	const recording = `${embedAudio ? "!" : ""}${SAMPLE_RECORDING}`;
	const answers = questions.map((question, index) => ({
		question,
		content: index === questions.length - 1 ? recording : SAMPLE_TEXT,
	}));
	return {
		heading: format.heading ? `${"#".repeat(format.heading.level)} ${format.heading.text}` : null,
		text: formatter.format(format.text, SAMPLE_TEXT, tags),
		audio: formatter.format(format.audio, recording, tags),
		answers: questions.length === 0 ? [] : new AnswerEntry(formatter).lines(format, headLine, answers, tags),
	};
}

export function modeSummary(mode: CaptureMode, defaults: EntryFormat): string {
	const heading = resolveFormat(defaults, mode.overrides).heading;
	const summary = `${targetSummary(mode)} · ${heading ? `under “${heading.text}”` : "end of note"}`;
	const questions = askedQuestions(mode).length;
	if (questions === 0) return summary;
	return `${summary} · ${questions} ${questions === 1 ? "question" : "questions"}`;
}

function dailySummary(daysBack: number): string {
	if (daysBack === 0) return "Daily note";
	return `Daily note, ${daysBack} ${daysBack === 1 ? "day" : "days"} back`;
}

function targetSummary(mode: CaptureMode): string {
	if (mode.target.type === "daily") return dailySummary(mode.target.daysBack);
	const files = mode.target.files.filter((file) => file.path.trim() !== "");
	if (files.length === 0) return "No file yet";
	if (files.length === 1) return files[0].alias.trim() || noteName(files[0].path);
	return `${files.length} files`;
}
