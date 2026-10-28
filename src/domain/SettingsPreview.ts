import { AnswerEntry } from "./AnswerEntry";
import { askedQuestions, CaptureMode, EntryFormat, noteName, resolveFormat, ResolvedFormat } from "./CaptureMode";
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

export function previewAnswers(mode: CaptureMode, embedAudio: boolean, clock: Clock, sampleTag = ""): string[] {
	const questions = askedQuestions(mode);
	const answers = questions.map((question, index) => {
		const voice = index === questions.length - 1 && questions.length > 1;
		const content = voice ? `${embedAudio ? "!" : ""}${SAMPLE_RECORDING}` : SAMPLE_TEXT;
		return { question: question.text.trim(), content, voice };
	});
	return new AnswerEntry(new EntryFormatter(clock)).lines(mode.questionFormat, mode.headLine, answers, [sampleTag]);
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
