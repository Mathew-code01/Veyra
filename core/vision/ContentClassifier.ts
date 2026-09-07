// core/vision/ContentClassifier.ts

export type VisualContentType =
  | "code"
  | "document"
  | "diagram"
  | "chart"
  | "screenshot"
  | "question"
  | "table"
  | "text"
  | "mixed"
  | "unknown";

export interface ContentClassification {
  readonly type: VisualContentType;
  readonly confidence: number;
  readonly signals: readonly string[];
}

export interface ContentClassifierInput {
  readonly ocrText?: string;
  readonly width?: number;
  readonly height?: number;
  readonly source?: string;
}

export class ContentClassifier {
  public classify(input: ContentClassifierInput): ContentClassification {
    const text = input.ocrText?.trim() ?? "";

    if (!text) {
      return {
        type: "unknown",
        confidence: 0.2,
        signals: ["No OCR text available."],
      };
    }

    const scores = new Map<VisualContentType, number>();

    const add = (type: VisualContentType, score: number) => {
      scores.set(type, (scores.get(type) ?? 0) + score);
    };

    if (
      /(?:function|const|let|var|class|interface|import|export|return)\b/i.test(
        text,
      )
    ) {
      add("code", 0.8);
    }

    if (/(?:SELECT|FROM|WHERE|JOIN|INSERT INTO)\b/i.test(text)) {
      add("code", 0.8);
    }

    if (
      /(?:system design|architecture|service|database|api|load balancer|cache|queue)/i.test(
        text,
      )
    ) {
      add("diagram", 0.5);
    }

    if (
      /(?:question|problem|constraints|examples|input|output|requirements)/i.test(
        text,
      )
    ) {
      add("question", 0.55);
    }

    if (
      /(?:revenue|growth|percentage|percent|sales|users|metric|month|year)/i.test(
        text,
      )
    ) {
      add("chart", 0.45);
    }

    if (/\|.+\|/.test(text) || /(?:row|column|header)/i.test(text)) {
      add("table", 0.45);
    }

    if (
      /(?:resume|curriculum vitae|experience|education|skills|certifications)/i.test(
        text,
      )
    ) {
      add("document", 0.7);
    }

    if (scores.size === 0) {
      return {
        type: "text",
        confidence: 0.5,
        signals: ["OCR text detected without a stronger content pattern."],
      };
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    const [type, rawScore] = ranked[0];

    if (ranked.length > 1 && Math.abs(rawScore - ranked[1][1]) < 0.15) {
      return {
        type: "mixed",
        confidence: Math.min(0.95, rawScore),
        signals: ranked.map(([name, score]) => `${name}:${score.toFixed(2)}`),
      };
    }

    return {
      type,
      confidence: Math.min(0.98, rawScore),
      signals: ranked.map(([name, score]) => `${name}:${score.toFixed(2)}`),
    };
  }
}