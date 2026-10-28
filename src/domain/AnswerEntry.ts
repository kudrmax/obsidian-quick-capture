import { ResolvedFormat } from "./CaptureMode";
import { EntryFormatter } from "./EntryFormatter";

export interface AnswerLine {
	question: string;
	content: string;
}

export class AnswerEntry {
	constructor(private readonly formatter: EntryFormatter) {}

	lines(format: ResolvedFormat, headLine: boolean, answers: readonly AnswerLine[], tags: readonly string[]): string[] {
		const head = { prefix: format.text.prefix.trimEnd(), suffix: format.text.suffix };
		const answerLines = answers.map(({ question, content }, index) =>
			this.formatter.format(format.answer, content, !headLine && index === 0 ? tags : [], question),
		);
		return headLine ? [this.formatter.format(head, "", tags).trimEnd(), ...answerLines] : answerLines;
	}
}
