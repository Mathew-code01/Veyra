// ============================================================================
// FILE: core/vision/classification/ContentClassifier.ts
//
// PURPOSE:
// Deterministic visual-content classifier for general interview scenarios.
//
// IMPORTANT:
// This classifier does NOT attempt to understand the answer to the visual
// question.
//
// It determines what kind of visual material appears to be present.
//
// Examples:
// - coding problem
// - architecture diagram
// - chart
// - resume
// - job description
// - webpage
// - terminal
// - whiteboard
// - presentation
// - form
// - table
// - general document
// - mixed visual content
// ============================================================================

export type VisualContentType =
  | "code"
  | "document"
  | "diagram"
  | "chart"
  | "table"
  | "screenshot"
  | "webpage"
  | "terminal"
  | "whiteboard"
  | "presentation"
  | "form"
  | "resume"
  | "job_description"
  | "question"
  | "text"
  | "object"
  | "scene"
  | "mixed"
  | "unknown";

export interface ContentClassification {
  readonly type: VisualContentType;
  readonly confidence: number;
  readonly signals: readonly string[];
  readonly scores: Readonly<Partial<Record<VisualContentType, number>>>;
}

export interface ContentClassifierInput {
  readonly ocrText?: string;
  readonly width?: number;
  readonly height?: number;
  readonly source?: string;
}

const TYPES: readonly VisualContentType[] = [
  "code",
  "document",
  "diagram",
  "chart",
  "table",
  "screenshot",
  "webpage",
  "terminal",
  "whiteboard",
  "presentation",
  "form",
  "resume",
  "job_description",
  "question",
  "text",
  "object",
  "scene",
];

export class ContentClassifier {
  public classify(input: ContentClassifierInput): ContentClassification {
    const text = normalizeText(input?.ocrText);

    if (!text) {
      return {
        type: inferNonTextType(input),
        confidence: inferNonTextType(input) === "unknown" ? 0.2 : 0.4,
        signals: ["No OCR text available."],
        scores: {},
      };
    }

    const scores = new Map<VisualContentType, number>();

    const signals = new Map<VisualContentType, string[]>();

    const add = (
      type: VisualContentType,
      score: number,
      signal: string,
    ): void => {
      scores.set(type, (scores.get(type) ?? 0) + score);

      const current = signals.get(type) ?? [];

      current.push(signal);

      signals.set(type, current);
    };

    // ------------------------------------------------------------------------
    // Code
    // ------------------------------------------------------------------------

    if (
      /\b(function|const|let|var|class|interface|import|export|return|async|await|public|private|protected|extends|implements)\b/i.test(
        text,
      )
    ) {
      add("code", 0.75, "Programming-language keywords detected.");
    }

    if (/[{};]\s*(?:const|let|return|if|for|while)\b/i.test(text)) {
      add("code", 0.45, "Code-like syntax detected.");
    }

    if (
      /\b(SELECT|FROM|WHERE|JOIN|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b/i.test(
        text,
      )
    ) {
      add("code", 0.8, "SQL syntax detected.");
    }

    // ------------------------------------------------------------------------
    // Architecture / diagrams
    // ------------------------------------------------------------------------

    if (
      /\b(system design|architecture|microservice|microservices|service|database|api gateway|load balancer|cache|queue|worker|broker|event bus|replica|shard|cdn)\b/i.test(
        text,
      )
    ) {
      add("diagram", 0.65, "Architecture terminology detected.");
    }

    if (/(?:->|→|<-|←|↔|↓|↑|=>)/.test(text)) {
      add("diagram", 0.35, "Directional diagram markers detected.");
    }

    // ------------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------------

    if (
      /\b(revenue|growth|percentage|percent|sales|users|metrics|metric|quarter|month|year|trend|forecast|market share|conversion|profit|loss)\b/i.test(
        text,
      )
    ) {
      add("chart", 0.5, "Quantitative/chart terminology detected.");
    }

    if (/(?:%|\b\d+(?:\.\d+)?%)/.test(text)) {
      add("chart", 0.25, "Percentage values detected.");
    }

    // ------------------------------------------------------------------------
    // Tables
    // ------------------------------------------------------------------------

    if (/\|.+\|/.test(text)) {
      add("table", 0.7, "Table delimiter pattern detected.");
    }

    if (
      /\b(row|rows|column|columns|header|headers|subtotal|total)\b/i.test(text)
    ) {
      add("table", 0.35, "Table terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Resume
    // ------------------------------------------------------------------------

    if (
      /\b(curriculum vitae|resume|professional experience|work experience|education|skills|certifications|employment history)\b/i.test(
        text,
      )
    ) {
      add("resume", 0.85, "Resume terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Job description
    // ------------------------------------------------------------------------

    if (
      /\b(job description|required qualifications|preferred qualifications|responsibilities|requirements|nice to have|must have|years of experience)\b/i.test(
        text,
      )
    ) {
      add("job_description", 0.8, "Job-description terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Questions / interview prompts
    // ------------------------------------------------------------------------

    if (
      /\b(question|interview question|problem|constraints|example|input|output|requirements|what would you do|explain|why|how would you)\b/i.test(
        text,
      )
    ) {
      add(
        "question",
        0.55,
        "Question or interview-prompt terminology detected.",
      );
    }

    // ------------------------------------------------------------------------
    // Webpage
    // ------------------------------------------------------------------------

    if (
      /\b(address bar|navigation|sign in|log in|menu|home|settings|search|browser|http|https|www\.)\b/i.test(
        text,
      )
    ) {
      add("webpage", 0.6, "Webpage/browser terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Terminal
    // ------------------------------------------------------------------------

    if (
      /(?:PS C:\\|C:\\Users\\|\/home\/|\/usr\/|npm |pnpm |yarn |git |docker |kubectl |bash|zsh|powershell|terminal|command not found|permission denied)/i.test(
        text,
      )
    ) {
      add("terminal", 0.9, "Terminal or shell output detected.");
    }

    // ------------------------------------------------------------------------
    // Whiteboard
    // ------------------------------------------------------------------------

    if (
      /\b(whiteboard|draw|sketch|brainstorm|solution|approach|flow|idea)\b/i.test(
        text,
      )
    ) {
      add("whiteboard", 0.45, "Whiteboard-style terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Presentation
    // ------------------------------------------------------------------------

    if (
      /\b(slide|slides|agenda|overview|objective|presentation|speaker notes)\b/i.test(
        text,
      )
    ) {
      add("presentation", 0.55, "Presentation terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Forms
    // ------------------------------------------------------------------------

    if (
      /\b(name|email|phone|address|date of birth|country|state|city|submit|cancel|required field|optional field)\b/i.test(
        text,
      )
    ) {
      add("form", 0.45, "Form-field terminology detected.");
    }

    // ------------------------------------------------------------------------
    // Document / text
    // ------------------------------------------------------------------------

    if (
      /\b(document|report|section|chapter|paragraph|summary|introduction|conclusion|appendix)\b/i.test(
        text,
      )
    ) {
      add("document", 0.4, "Document terminology detected.");
    }

    if (text.length > 40) {
      add("text", 0.2, "Substantial visible text detected.");
    }

    if (!scores.size) {
      return {
        type: "text",
        confidence: 0.5,
        signals: ["OCR text detected without a stronger content pattern."],
        scores: {},
      };
    }

    const ranked = [...scores.entries()].sort(([, a], [, b]) => b - a);

    const [primaryType, primaryScore] = ranked[0];

    const secondary = ranked[1];

    if (secondary && Math.abs(primaryScore - secondary[1]) < 0.15) {
      return {
        type: "mixed",
        confidence: clampConfidence(primaryScore),
        signals: ranked.map(([type, score]) => `${type}:${score.toFixed(2)}`),
        scores: toReadonlyScores(scores),
      };
    }

    return {
      type: primaryType,
      confidence: clampConfidence(primaryScore),
      signals: ranked.flatMap(([type]) => signals.get(type) ?? []),
      scores: toReadonlyScores(scores),
    };
  }
}

function normalizeText(value: string | undefined): string {
  return (
    value
      ?.replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim() ?? ""
  );
}

function inferNonTextType(
  input: ContentClassifierInput | undefined,
): VisualContentType {
  const source = input?.source?.trim().toLowerCase();

  if (source === "screenshot" || source === "screen") {
    return "screenshot";
  }

  return "unknown";
}

function clampConfidence(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(0.98, Math.max(0.05, score));
}

function toReadonlyScores(
  scores: Map<VisualContentType, number>,
): Readonly<Partial<Record<VisualContentType, number>>> {
  const result: Partial<Record<VisualContentType, number>> = {};

  for (const type of TYPES) {
    const score = scores.get(type);

    if (score !== undefined) {
      result[type] = Number(score.toFixed(4));
    }
  }

  return Object.freeze(result);
}
