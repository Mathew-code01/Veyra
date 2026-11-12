// ============================================================================
// FILE: core/interview/communication/CommunicationAssistanceEngine.ts
//
// PURPOSE:
// Analyzes candidate speech/text for grammar, filler words, repetition,
// awkward phrasing, and tone while preserving authentic candidate voice.
// ============================================================================

import type {
  CommunicationFeedback,
  GrammarIssue,
} from "../../../shared/types/interviews";

const COMMON_FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "sort of",
  "kind of",
  "i mean",
  "right",
];

const GRAMMAR_RULES: Readonly<Array<{ pattern: RegExp; correction: string; explanation: string; severity: "low" | "medium" | "high" }>> = [
  {
    pattern: /\b(?:i was did|i was done that)\b/i,
    correction: "I did / I had done that",
    explanation: "Incorrect past tense construction.",
    severity: "high",
  },
  {
    pattern: /\b(?:could of|should of|would of)\b/i,
    correction: "could have / should have / would have",
    explanation: "Use 'have' instead of 'of' with modal verbs.",
    severity: "medium",
  },
  {
    pattern: /\b(?:irregardless)\b/i,
    correction: "regardless",
    explanation: "'Regardless' is standard professional usage.",
    severity: "low",
  },
  {
    pattern: /\b(?:me and my (?:team|colleague|manager))\b/i,
    correction: "my $1 and I",
    explanation: "Use subject pronoun 'I' when acting as the subject of the sentence.",
    severity: "medium",
  },
  {
    pattern: /\b(?:we was)\b/i,
    correction: "we were",
    explanation: "Subject-verb agreement error with plural pronoun.",
    severity: "high",
  },
  {
    pattern: /\b(?:more better|more faster|most best)\b/i,
    correction: "better / faster / best",
    explanation: "Double comparative / superlative error.",
    severity: "medium",
  },
];

export class CommunicationAssistanceEngine {
  public analyze(transcriptOrText: string): CommunicationFeedback {
    const text = transcriptOrText.trim();
    if (!text) {
      return {
        overallRating: "needs_improvement",
        fillerWordsCount: 0,
        fillerWordsDetected: [],
        grammarIssues: [],
        awkwardPhrasings: [],
        repetitionInstances: [],
        concisenessFeedback: "No speech or text provided to analyze.",
        toneAssessment: "hesitant",
      };
    }

    // 1. Detect filler words
    const fillerWordsDetected: Array<{ word: string; occurrences: number }> = [];
    let totalFillers = 0;

    for (const filler of COMMON_FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        fillerWordsDetected.push({ word: filler, occurrences: matches.length });
        totalFillers += matches.length;
      }
    }

    // 2. Detect grammar issues
    const grammarIssues: GrammarIssue[] = [];
    for (const rule of GRAMMAR_RULES) {
      const match = rule.pattern.exec(text);
      if (match) {
        grammarIssues.push({
          originalText: match[0],
          suggestedCorrection: rule.correction,
          explanation: rule.explanation,
          severity: rule.severity,
        });
      }
    }

    // 3. Detect repetition
    const repetitionInstances: string[] = [];
    const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const wordCounts = new Map<string, number>();
    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
    for (const [w, count] of wordCounts.entries()) {
      if (count >= 5) {
        repetitionInstances.push(`The word "${w}" was repeated ${count} times.`);
      }
    }

    // 4. Awkward phrasing detection
    const awkwardPhrasings: string[] = [];
    if (/\b(?:at the end of the day|to be completely honest with you|as i said before)\b/i.test(text)) {
      awkwardPhrasings.push("Cliché phrase detected: 'at the end of the day' or 'to be honest' can sound informal.");
    }
    if (text.length > 200 && !/[.!?]/.test(text)) {
      awkwardPhrasings.push("Extremely long run-on sentence without punctuation breaks.");
    }

    // 5. Conciseness & Tone
    const totalWords = text.split(/\s+/).filter(Boolean).length;
    let concisenessFeedback = "Appropriate response length.";
    if (totalWords > 400) {
      concisenessFeedback = "Answer is quite lengthy (over 400 words). Practice condensing to the core highlights.";
    } else if (totalWords < 40) {
      concisenessFeedback = "Answer is very brief (under 40 words). Expand with a concrete result or reflection.";
    }

    let toneAssessment: CommunicationFeedback["toneAssessment"] = "professional";
    if (/\b(?:gonna|wanna|kinda|dunno|dude|yeah nah)\b/i.test(text)) {
      toneAssessment = "casual";
    } else if (/\b(?:i guess|maybe i think|probably not sure)\b/i.test(text)) {
      toneAssessment = "hesitant";
    } else if (/\b(?:heretofore|whilst|ergo|insofar as)\b/i.test(text)) {
      toneAssessment = "overly_formal";
    }

    // 6. Overall Rating
    let overallRating: CommunicationFeedback["overallRating"] = "good";
    if (totalFillers === 0 && grammarIssues.length === 0 && toneAssessment === "professional") {
      overallRating = "excellent";
    } else if (totalFillers >= 3 || grammarIssues.length > 0 || toneAssessment === "casual") {
      overallRating = "needs_improvement";
    }

    return {
      overallRating,
      fillerWordsCount: totalFillers,
      fillerWordsDetected,
      grammarIssues,
      awkwardPhrasings,
      repetitionInstances,
      concisenessFeedback,
      toneAssessment,
      pacingNotes: `Pacing estimate: ~${Math.round((totalWords / 130) * 10) / 10} minutes spoken delivery.`,
    };
  }
}
