import { QuestionFormat } from "./CaptureMode";
import { EntryFormatter } from "./EntryFormatter";

export interface AnswerLine {
	question: string;
	content: string;
	voice: boolean;
}

const NESTED = "\t";

export class AnswerEntry {
	constructor(private readonly formatter: EntryFormatter) {}

	lines(format: QuestionFormat, headLine: boolean, answers: readonly AnswerLine[], tags: readonly string[]): string[] {
		const answerLines = answers.map(({ question, content, voice }, index) => {
			const answerTags = !headLine && index === 0 ? tags : [];
			const line = this.formatter.format(voice ? format.voice : format.text, content, answerTags, question);
			return headLine ? NESTED + line : line;
		});
		return headLine ? [this.formatter.format(format.line, "", tags).trimEnd(), ...answerLines] : answerLines;
	}
}
