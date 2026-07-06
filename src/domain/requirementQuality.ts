import type { WorkshopArtifact, WorkshopLanguage } from "./workshop";

export type RequirementQualityFindingKind =
  | "ambiguity"
  | "missing-acceptance-criteria"
  | "unverifiable-claim"
  | "conflict"
  | "missing-non-functional-concern";

export type RequirementQualityFindingSeverity = "warning" | "blocker";

export type RequirementQualityFinding = {
  id: string;
  kind: RequirementQualityFindingKind;
  severity: RequirementQualityFindingSeverity;
  artifactId: string;
  relatedArtifactIds: string[];
  title: string;
  detail: string;
  question: string;
};

export type RequirementQualityEvaluationOptions = {
  language?: WorkshopLanguage;
  focusArtifactIds?: string[];
};

const ambiguousTerms = [
  "appropriate",
  "as needed",
  "as soon as possible",
  "easy",
  "efficient",
  "fast",
  "flexible",
  "intuitive",
  "relevant",
  "robust",
  "seamless",
  "simple",
  "soon",
  "sufficient",
  "user-friendly",
  "användarvänlig",
  "effektiv",
  "enkel",
  "intuitiv",
  "lämplig",
  "relevant",
  "robust",
  "skyndsamt",
  "smidig",
  "snabb",
  "snart",
  "tillräcklig",
  "vid behov",
];

const unverifiableClaimTerms = [
  "boost",
  "better",
  "ensure",
  "increase",
  "improve",
  "minimize",
  "optimize",
  "reduce",
  "streamline",
  "förbättra",
  "höja",
  "minimera",
  "minska",
  "optimera",
  "säkerställa",
  "snabba upp",
  "öka",
];

const nonFunctionalConcernTerms = [
  "accessibility",
  "audit",
  "availability",
  "capacity",
  "compliance",
  "data freshness",
  "latency",
  "logging",
  "performance",
  "privacy",
  "reliability",
  "resilience",
  "retention",
  "scalability",
  "security",
  "throughput",
  "tillgänglighet",
  "åtkomst",
  "kapacitet",
  "datakvalitet",
  "färsk",
  "latens",
  "loggning",
  "prestanda",
  "sekretess",
  "skalbarhet",
  "säkerhet",
  "svarstid",
  "tillförlitlighet",
];

const acceptanceCriteriaSignals = [
  "acceptance criteria",
  "accepted when",
  "approval criteria",
  "definition of done",
  "given",
  "then",
  "when",
  "success criteria",
  "testable by",
  "verifiable by",
  "acceptanskriter",
  "godkänd när",
  "givet",
  "när",
  "så",
  "testbar genom",
  "verifierbar genom",
];

const positiveVisibilityTerms = [
  "allow",
  "display",
  "enable",
  "include",
  "show",
  "store",
  "visa",
  "inkludera",
  "spara",
  "tillåta",
  "möjliggöra",
];

const negativeVisibilityTerms = [
  "exclude",
  "hide",
  "must not",
  "never",
  "not display",
  "not include",
  "not show",
  "should not",
  "dölja",
  "exkludera",
  "får inte",
  "inte inkludera",
  "inte visa",
  "ska inte",
  "aldrig",
];

const automatedTerms = ["automatic", "automated", "automatiskt"];
const manualTerms = ["manual", "manually", "manuell", "manuellt"];
const realtimeTerms = ["real-time", "realtime", "live", "direkt", "realtid"];
const batchTerms = ["batch", "daily", "nightly", "dagligen", "nattlig"];

const stopWords = new Set([
  "a",
  "all",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "must",
  "need",
  "needs",
  "not",
  "of",
  "on",
  "or",
  "shall",
  "should",
  "system",
  "the",
  "this",
  "to",
  "with",
  "att",
  "av",
  "behöver",
  "det",
  "den",
  "en",
  "ett",
  "för",
  "i",
  "inte",
  "kan",
  "krav",
  "med",
  "och",
  "om",
  "på",
  "ska",
  "som",
  "systemet",
  "till",
  "vara",
  "visa",
]);

export function evaluateRequirementQuality(
  artifacts: WorkshopArtifact[],
  options: RequirementQualityEvaluationOptions = {},
): RequirementQualityFinding[] {
  const language = options.language ?? "en";
  const requirements = artifacts.filter(
    (artifact) => artifact.type === "requirement",
  );
  const focusIds = new Set(options.focusArtifactIds ?? []);
  const focusedRequirements =
    focusIds.size > 0
      ? requirements.filter((artifact) => focusIds.has(artifact.id))
      : requirements;

  const findings: RequirementQualityFinding[] = [];

  for (const requirement of focusedRequirements) {
    const text = artifactText(requirement);
    const ambiguous = findFirstTerm(text, ambiguousTerms);
    if (ambiguous) {
      findings.push(
        createFinding({
          kind: "ambiguity",
          severity: "warning",
          artifact: requirement,
          language,
          title: copyFor(language).ambiguityTitle,
          detail: copyFor(language).ambiguityDetail(ambiguous),
          question: copyFor(language).ambiguityQuestion(ambiguous),
        }),
      );
    }

    if (!hasAcceptanceCriteriaSignal(requirement)) {
      findings.push(
        createFinding({
          kind: "missing-acceptance-criteria",
          severity: "blocker",
          artifact: requirement,
          language,
          title: copyFor(language).missingAcceptanceTitle,
          detail: copyFor(language).missingAcceptanceDetail,
          question: copyFor(language).missingAcceptanceQuestion,
        }),
      );
    }

    const claim = findFirstTerm(text, unverifiableClaimTerms);
    if (claim && !hasMeasurableSignal(text)) {
      findings.push(
        createFinding({
          kind: "unverifiable-claim",
          severity: "warning",
          artifact: requirement,
          language,
          title: copyFor(language).unverifiableTitle,
          detail: copyFor(language).unverifiableDetail(claim),
          question: copyFor(language).unverifiableQuestion,
        }),
      );
    }
  }

  findings.push(...findConflicts(requirements, focusedRequirements, language));

  if (
    focusedRequirements.length > 0 &&
    !artifacts.some((artifact) =>
      containsAny(artifactText(artifact), nonFunctionalConcernTerms),
    )
  ) {
    const artifact = focusedRequirements[0];
    if (artifact) {
      findings.push(
        createFinding({
          kind: "missing-non-functional-concern",
          severity: "warning",
          artifact,
          language,
          title: copyFor(language).missingNonFunctionalTitle,
          detail: copyFor(language).missingNonFunctionalDetail,
          question: copyFor(language).missingNonFunctionalQuestion,
        }),
      );
    }
  }

  return findings;
}

export function requirementQualityQuestionDraft(
  finding: RequirementQualityFinding,
) {
  return {
    type: "question" as const,
    title: finding.title,
    content: finding.question,
    tags: [
      "quality-check",
      `quality:${finding.kind}`,
      `requirement:${finding.artifactId}`,
    ],
  };
}

export function firstRequirementQualityQuestion(
  findings: RequirementQualityFinding[],
) {
  return findings[0]?.question;
}

function createFinding(args: {
  kind: RequirementQualityFindingKind;
  severity: RequirementQualityFindingSeverity;
  artifact: WorkshopArtifact;
  language: WorkshopLanguage;
  title: string;
  detail: string;
  question: string;
  relatedArtifactIds?: string[];
}): RequirementQualityFinding {
  const relatedArtifactIds = args.relatedArtifactIds ?? [];

  return {
    id: `${args.kind}:${args.artifact.id}${relatedArtifactIds.length ? `:${relatedArtifactIds.join("+")}` : ""}`,
    kind: args.kind,
    severity: args.severity,
    artifactId: args.artifact.id,
    relatedArtifactIds,
    title: args.title,
    detail: args.detail,
    question: args.question,
  };
}

function findConflicts(
  requirements: WorkshopArtifact[],
  focusedRequirements: WorkshopArtifact[],
  language: WorkshopLanguage,
) {
  const findings: RequirementQualityFinding[] = [];
  const focusedIds = new Set(
    focusedRequirements.map((artifact) => artifact.id),
  );

  for (let leftIndex = 0; leftIndex < requirements.length; leftIndex += 1) {
    const left = requirements[leftIndex];
    if (!left) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < requirements.length;
      rightIndex += 1
    ) {
      const right = requirements[rightIndex];
      if (!right || (!focusedIds.has(left.id) && !focusedIds.has(right.id))) {
        continue;
      }

      const conflict = conflictReason(left, right);
      if (!conflict) {
        continue;
      }

      findings.push(
        createFinding({
          kind: "conflict",
          severity: "blocker",
          artifact: focusedIds.has(left.id) ? left : right,
          relatedArtifactIds: [focusedIds.has(left.id) ? right.id : left.id],
          language,
          title: copyFor(language).conflictTitle,
          detail: copyFor(language).conflictDetail(
            focusedIds.has(left.id) ? right.title : left.title,
            conflict,
          ),
          question: copyFor(language).conflictQuestion,
        }),
      );
    }
  }

  return findings;
}

function conflictReason(left: WorkshopArtifact, right: WorkshopArtifact) {
  const leftText = artifactText(left);
  const rightText = artifactText(right);
  const hasOverlap = sharedMeaningfulTokens(leftText, rightText) >= 2;

  if (!hasOverlap) {
    return undefined;
  }

  const leftVisibility = visibilityPolarity(leftText);
  const rightVisibility = visibilityPolarity(rightText);
  if (leftVisibility && rightVisibility && leftVisibility !== rightVisibility) {
    return "visibility";
  }

  if (
    containsAny(leftText, automatedTerms) !==
      containsAny(rightText, automatedTerms) &&
    containsAny(leftText, manualTerms) !== containsAny(rightText, manualTerms)
  ) {
    return "automation";
  }

  if (
    containsAny(leftText, realtimeTerms) !==
      containsAny(rightText, realtimeTerms) &&
    containsAny(leftText, batchTerms) !== containsAny(rightText, batchTerms)
  ) {
    return "freshness";
  }

  return undefined;
}

function visibilityPolarity(text: string) {
  if (containsAny(text, negativeVisibilityTerms)) {
    return "negative";
  }

  if (containsAny(text, positiveVisibilityTerms)) {
    return "positive";
  }

  return undefined;
}

function hasAcceptanceCriteriaSignal(artifact: WorkshopArtifact) {
  const text = artifactText(artifact);
  return (
    containsAny(text, acceptanceCriteriaSignals) ||
    artifact.tags.some((tag) =>
      /^(ac|acceptance|acceptance-criteria|acceptanskriterier)$/i.test(tag),
    )
  );
}

function hasMeasurableSignal(text: string) {
  return (
    /(?:\d+(?:[.,]\d+)?\s*(?:%|percent|procent|ms|milliseconds?|millisekunder|seconds?|sekunder|minutes?|minuter|hours?|timmar|days?|dagar)?)/i.test(
      text,
    ) ||
    containsAny(text, [
      "at least",
      "at most",
      "no more than",
      "within",
      "minst",
      "högst",
      "inom",
      "senast",
    ])
  );
}

function findFirstTerm(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.find((term) => lower.includes(term));
}

function containsAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function sharedMeaningfulTokens(left: string, right: string) {
  const leftTokens = new Set(meaningfulTokens(left));
  return meaningfulTokens(right).filter((token) => leftTokens.has(token))
    .length;
}

function meaningfulTokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function artifactText(artifact: WorkshopArtifact) {
  return `${artifact.title} ${artifact.content} ${artifact.tags.join(" ")}`;
}

function copyFor(language: WorkshopLanguage) {
  if (language === "sv") {
    return {
      ambiguityTitle: "Förtydliga tvetydigt krav",
      ambiguityDetail: (term: string) =>
        `Kravet använder "${term}" utan en tydlig gräns eller definition.`,
      ambiguityQuestion: (term: string) =>
        `Vad betyder "${term}" konkret här, och var går gränsen för att kravet är uppfyllt?`,
      missingAcceptanceTitle: "Saknar acceptanskriterier",
      missingAcceptanceDetail: "Kravet saknar observerbara acceptanskriterier.",
      missingAcceptanceQuestion:
        "Vilket acceptanskriterium skulle göra att teamet kan godkänna detta krav?",
      unverifiableTitle: "Gör effekt verifierbar",
      unverifiableDetail: (term: string) =>
        `Kravet säger "${term}" utan mätpunkt eller observerbart resultat.`,
      unverifiableQuestion:
        "Vilket mätbart eller observerbart resultat visar att effekten faktiskt uppnås?",
      conflictTitle: "Möjlig kravkonflikt",
      conflictDetail: (title: string, reason: string) =>
        `Kravet verkar kunna stå i konflikt med "${title}" (${reason}).`,
      conflictQuestion:
        "Vilket av dessa krav ska styra om de inte kan uppfyllas samtidigt?",
      missingNonFunctionalTitle: "Saknar icke-funktionell oro",
      missingNonFunctionalDetail:
        "Inga icke-funktionella behov som säkerhet, prestanda, tillgänglighet eller datakvalitet har fångats.",
      missingNonFunctionalQuestion:
        "Vilken icke-funktionell aspekt är viktigast att säkra först: säkerhet, prestanda, tillgänglighet eller datakvalitet?",
    };
  }

  return {
    ambiguityTitle: "Clarify ambiguous requirement",
    ambiguityDetail: (term: string) =>
      `The requirement uses "${term}" without a clear boundary or definition.`,
    ambiguityQuestion: (term: string) =>
      `What does "${term}" mean here, and where is the boundary for the requirement being satisfied?`,
    missingAcceptanceTitle: "Missing acceptance criteria",
    missingAcceptanceDetail:
      "The requirement does not include observable acceptance criteria.",
    missingAcceptanceQuestion:
      "What acceptance criterion would let the team approve this requirement?",
    unverifiableTitle: "Make outcome verifiable",
    unverifiableDetail: (term: string) =>
      `The requirement says "${term}" without a measurement point or observable result.`,
    unverifiableQuestion:
      "What measurable or observable result proves that this outcome is achieved?",
    conflictTitle: "Possible requirement conflict",
    conflictDetail: (title: string, reason: string) =>
      `The requirement may conflict with "${title}" (${reason}).`,
    conflictQuestion:
      "Which requirement should take precedence if these cannot both be true?",
    missingNonFunctionalTitle: "Missing non-functional concern",
    missingNonFunctionalDetail:
      "No non-functional need such as security, performance, availability, or data quality has been captured.",
    missingNonFunctionalQuestion:
      "Which non-functional aspect matters most to secure first: security, performance, availability, or data quality?",
  };
}
