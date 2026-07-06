import type { WorkshopArtifact, WorkshopLanguage } from "./workshop";

export type RequirementQualityFindingKind =
  | "ambiguity"
  | "duplicate"
  | "missing-acceptance-criteria"
  | "missing-testability-signal"
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
  diagnostics: RequirementQualityDiagnostic[];
};

export type RequirementQualityDiagnostic = {
  code: string;
  message: string;
  evidence: string[];
  suggestion: string;
};

export type RequirementQualityEvaluationOptions = {
  language?: WorkshopLanguage;
  focusArtifactIds?: string[];
};

const ambiguousTerms = [
  "appropriate",
  "as needed",
  "as soon as possible",
  "clear",
  "easy",
  "efficient",
  "fast",
  "flexible",
  "intuitive",
  "minimal",
  "normal",
  "quick",
  "reasonable",
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
  "best",
  "boost",
  "better",
  "ensure",
  "enhance",
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
  "success criteria",
  "testable by",
  "verifiable by",
  "acceptanskriter",
  "godkänd när",
  "testbar genom",
  "verifierbar genom",
];

const positiveVisibilityTerms = [
  "access",
  "allow",
  "display",
  "enable",
  "include",
  "permit",
  "show",
  "store",
  "view",
  "åtkomst",
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
  "no access",
  "not display",
  "not include",
  "not show",
  "prevent",
  "prohibit",
  "should not",
  "deny",
  "block",
  "blockera",
  "dölja",
  "exkludera",
  "förhindra",
  "får inte",
  "inte inkludera",
  "inte visa",
  "neka",
  "ska inte",
  "aldrig",
];

const automatedTerms = ["automatic", "automated", "automatiskt"];
const manualTerms = ["manual", "manually", "manuell", "manuellt"];
const realtimeTerms = ["real-time", "realtime", "live", "direkt", "realtid"];
const batchTerms = ["batch", "daily", "nightly", "dagligen", "nattlig"];

const actorTerms = [
  "administrator",
  "agent",
  "analyst",
  "case worker",
  "caseworker",
  "customer",
  "manager",
  "operator",
  "owner",
  "role",
  "staff",
  "support team",
  "team",
  "user",
  "admin",
  "administratör",
  "agent",
  "analytiker",
  "användare",
  "handläggare",
  "kund",
  "operatör",
  "roll",
  "supportteam",
  "team",
];

const actionTerms = [
  "approve",
  "assign",
  "calculate",
  "create",
  "delete",
  "display",
  "edit",
  "export",
  "filter",
  "import",
  "load",
  "notify",
  "record",
  "search",
  "send",
  "show",
  "sort",
  "store",
  "submit",
  "sync",
  "track",
  "update",
  "view",
  "visa",
  "godkänna",
  "beräkna",
  "skapa",
  "radera",
  "redigera",
  "exportera",
  "filtrera",
  "importera",
  "ladda",
  "avisera",
  "spara",
  "söka",
  "skicka",
  "sortera",
  "synka",
  "uppdatera",
];

const outcomeSignals = [
  "so that",
  "in order to",
  "because",
  "therefore",
  "result",
  "outcome",
  "status",
  "confirmation",
  "audit trail",
  "för att",
  "så att",
  "resultat",
  "utfall",
  "status",
  "bekräftelse",
  "spårbarhet",
];

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
  const copy = copyFor(language);
  const requirements = artifacts.filter(
    (artifact) =>
      artifact.type === "requirement" &&
      (artifact.status === "draft" || artifact.status === "accepted"),
  );
  const focusIds = new Set(options.focusArtifactIds ?? []);
  const focusedRequirements =
    focusIds.size > 0
      ? requirements.filter((artifact) => focusIds.has(artifact.id))
      : requirements;

  const findings: RequirementQualityFinding[] = [];

  for (const requirement of focusedRequirements) {
    const text = artifactText(requirement);
    const ambiguous = findFirstTermMatch(text, ambiguousTerms);
    if (ambiguous) {
      const detail = copy.ambiguityDetail(ambiguous.term);
      const question = copy.ambiguityQuestion(ambiguous.term);
      findings.push(
        createFinding({
          kind: "ambiguity",
          severity: "warning",
          artifact: requirement,
          language,
          title: copy.ambiguityTitle,
          detail,
          question,
          diagnostics: [
            createDiagnostic({
              code: "quality.ambiguity.vague-term",
              message: detail,
              evidence: [ambiguous.evidence],
              suggestion: question,
            }),
          ],
        }),
      );
    }

    if (!hasAcceptanceCriteriaSignal(requirement)) {
      const detail = copy.missingAcceptanceDetail;
      findings.push(
        createFinding({
          kind: "missing-acceptance-criteria",
          severity: "blocker",
          artifact: requirement,
          language,
          title: copy.missingAcceptanceTitle,
          detail,
          question: copy.missingAcceptanceQuestion,
          diagnostics: [
            createDiagnostic({
              code: "quality.testability.missing-acceptance-criteria",
              message: detail,
              evidence: [requirement.title],
              suggestion: copy.missingAcceptanceQuestion,
            }),
          ],
        }),
      );
    }

    const testabilityGaps = findTestabilityGaps(requirement);
    if (testabilityGaps.length > 0) {
      const detail = copy.missingTestabilityDetail(testabilityGaps);
      findings.push(
        createFinding({
          kind: "missing-testability-signal",
          severity: "warning",
          artifact: requirement,
          language,
          title: copy.missingTestabilityTitle,
          detail,
          question: copy.missingTestabilityQuestion(testabilityGaps),
          diagnostics: testabilityGaps.map((gap) =>
            createDiagnostic({
              code: `quality.testability.missing-${gap}`,
              message: copy.missingTestabilityDiagnostic(gap),
              evidence: [requirement.title],
              suggestion: copy.missingTestabilityQuestion([gap]),
            }),
          ),
        }),
      );
    }

    const claim = findFirstTermMatch(text, unverifiableClaimTerms);
    if (claim && !hasMeasurableSignal(text)) {
      const detail = copy.unverifiableDetail(claim.term);
      findings.push(
        createFinding({
          kind: "unverifiable-claim",
          severity: "warning",
          artifact: requirement,
          language,
          title: copy.unverifiableTitle,
          detail,
          question: copy.unverifiableQuestion,
          diagnostics: [
            createDiagnostic({
              code: "quality.testability.unmeasured-outcome",
              message: detail,
              evidence: [claim.evidence],
              suggestion: copy.unverifiableQuestion,
            }),
          ],
        }),
      );
    }
  }

  findings.push(...findConflicts(requirements, focusedRequirements, language));

  const nonFunctionalScope =
    focusIds.size > 0 ? focusedRequirements : requirements;
  if (
    focusedRequirements.length > 0 &&
    !nonFunctionalScope.some((artifact) =>
      containsAny(artifactText(artifact), nonFunctionalConcernTerms),
    )
  ) {
    const artifact = focusedRequirements[0];
    if (artifact) {
      const detail = copy.missingNonFunctionalDetail;
      findings.push(
        createFinding({
          kind: "missing-non-functional-concern",
          severity: "warning",
          artifact,
          language,
          title: copy.missingNonFunctionalTitle,
          detail,
          question: copy.missingNonFunctionalQuestion,
          diagnostics: [
            createDiagnostic({
              code: "quality.nonfunctional.missing-concern",
              message: detail,
              evidence: nonFunctionalScope.map((candidate) => candidate.title),
              suggestion: copy.missingNonFunctionalQuestion,
            }),
          ],
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
  diagnostics?: RequirementQualityDiagnostic[];
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
    diagnostics: args.diagnostics ?? [],
  };
}

function createDiagnostic(args: RequirementQualityDiagnostic) {
  return args;
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

      const relationship = requirementRelationship(left, right);
      if (!relationship) {
        continue;
      }

      const artifact = focusedIds.has(left.id) ? left : right;
      const relatedArtifact = focusedIds.has(left.id) ? right : left;
      const isConflict = relationship.kind === "conflict";
      findings.push(
        createFinding({
          kind: relationship.kind,
          severity: isConflict ? "blocker" : "warning",
          artifact,
          relatedArtifactIds: [relatedArtifact.id],
          language,
          title: isConflict
            ? copyFor(language).conflictTitle
            : copyFor(language).duplicateTitle,
          detail: isConflict
            ? copyFor(language).conflictDetail(
                relatedArtifact.title,
                relationship.reason,
              )
            : copyFor(language).duplicateDetail(relatedArtifact.title),
          question: isConflict
            ? copyFor(language).conflictQuestion
            : copyFor(language).duplicateQuestion,
          diagnostics: relationship.diagnostics,
        }),
      );
    }
  }

  return findings;
}

function requirementRelationship(
  left: WorkshopArtifact,
  right: WorkshopArtifact,
) {
  const leftText = artifactText(left);
  const rightText = artifactText(right);
  const overlap = meaningfulTokenOverlap(leftText, rightText);

  if (overlap.shared < 2) {
    return undefined;
  }

  const leftVisibility = visibilityPolarity(leftText);
  const rightVisibility = visibilityPolarity(rightText);
  if (leftVisibility && rightVisibility && leftVisibility !== rightVisibility) {
    return {
      kind: "conflict" as const,
      reason: "opposing visibility or access intent",
      diagnostics: [
        createDiagnostic({
          code: "quality.conflict.visibility",
          message:
            "Related requirements use opposite visibility or access language.",
          evidence: [left.title, right.title],
          suggestion:
            "Choose which visibility or access rule takes precedence, or split the scope.",
        }),
      ],
    };
  }

  if (
    containsAny(leftText, automatedTerms) !==
      containsAny(rightText, automatedTerms) &&
    containsAny(leftText, manualTerms) !== containsAny(rightText, manualTerms)
  ) {
    return {
      kind: "conflict" as const,
      reason: "manual versus automated operation",
      diagnostics: [
        createDiagnostic({
          code: "quality.conflict.automation",
          message:
            "Related requirements disagree on whether the behavior is manual or automated.",
          evidence: [left.title, right.title],
          suggestion:
            "Decide whether this behavior is manual, automated, or two separate flows.",
        }),
      ],
    };
  }

  if (
    containsAny(leftText, realtimeTerms) !==
      containsAny(rightText, realtimeTerms) &&
    containsAny(leftText, batchTerms) !== containsAny(rightText, batchTerms)
  ) {
    return {
      kind: "conflict" as const,
      reason: "real-time versus batch timing",
      diagnostics: [
        createDiagnostic({
          code: "quality.conflict.freshness",
          message:
            "Related requirements disagree on whether updates are live or batch based.",
          evidence: [left.title, right.title],
          suggestion:
            "Define the expected freshness target and when batch processing is acceptable.",
        }),
      ],
    };
  }

  if (overlap.ratio >= 0.65 && sameRequirementIntent(leftText, rightText)) {
    return {
      kind: "duplicate" as const,
      reason: "high token overlap",
      diagnostics: [
        createDiagnostic({
          code: "quality.duplicate.high-overlap",
          message: "Requirements have highly similar subject and action terms.",
          evidence: [left.title, right.title],
          suggestion:
            "Merge the requirements or clarify the distinction before approval.",
        }),
      ],
    };
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
    hasGherkinAcceptanceSignal(text) ||
    artifact.tags.some((tag) =>
      /^(ac|acceptance|acceptance-criteria|acceptanskriterier)$/i.test(tag),
    )
  );
}

function hasGherkinAcceptanceSignal(text: string) {
  return (
    containsAny(text, ["given", "givet"]) &&
    containsAny(text, ["when", "när"]) &&
    containsAny(text, ["then", "så"])
  );
}

function findTestabilityGaps(artifact: WorkshopArtifact) {
  const text = artifactText(artifact);
  const gaps: ("actor" | "action" | "outcome")[] = [];

  if (!hasActorSignal(text)) {
    gaps.push("actor");
  }

  if (!hasActionSignal(text)) {
    gaps.push("action");
  }

  if (!hasOutcomeSignal(text)) {
    gaps.push("outcome");
  }

  return gaps;
}

function hasActorSignal(text: string) {
  return (
    containsAny(text, actorTerms) ||
    /\b(?:for|by|from|to)\s+(?:the\s+)?[a-zåäö][a-zåäö-]{2,}/iu.test(text)
  );
}

function hasActionSignal(text: string) {
  return containsAny(text, actionTerms);
}

function hasOutcomeSignal(text: string) {
  return (
    hasMeasurableSignal(text) ||
    hasAcceptanceCriteriaSignal({
      id: "temporary",
      type: "requirement",
      title: "",
      content: text,
      status: "draft",
      createdBy: "",
      updatedAt: "",
      source: { participantId: "" },
      tags: [],
    }) ||
    containsAny(text, outcomeSignals)
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

function findFirstTermMatch(text: string, terms: string[]) {
  return findTermMatches(text, terms)[0];
}

function findTermMatches(text: string, terms: string[]) {
  return terms
    .flatMap((term) => {
      const escaped = escapeRegExp(term);
      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}-])(${escaped})(?=$|[^\\p{L}\\p{N}-])`,
        "giu",
      );
      const matches = [...text.matchAll(pattern)];
      const match = matches[0];

      if (!match || match.index === undefined) {
        return [];
      }

      const prefixLength = match[1]?.length ?? 0;
      const index = match.index + prefixLength;
      return [
        {
          term,
          index,
          evidence: snippetFor(text, index, term.length),
        },
      ];
    })
    .sort(
      (left, right) =>
        left.index - right.index || left.term.localeCompare(right.term),
    );
}

function containsAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function meaningfulTokenOverlap(left: string, right: string) {
  const leftTokens = new Set(meaningfulTokens(left));
  const rightTokens = new Set(meaningfulTokens(right));
  const shared = [...rightTokens].filter((token) => leftTokens.has(token));
  const denominator = Math.max(1, Math.min(leftTokens.size, rightTokens.size));

  return {
    shared: shared.length,
    ratio: shared.length / denominator,
  };
}

function sameRequirementIntent(left: string, right: string) {
  const leftVisibility = visibilityPolarity(left);
  const rightVisibility = visibilityPolarity(right);

  if (leftVisibility && rightVisibility && leftVisibility !== rightVisibility) {
    return false;
  }

  return (
    containsAny(left, actionTerms) === containsAny(right, actionTerms) ||
    sharedActionTerms(left, right).length > 0
  );
}

function sharedActionTerms(left: string, right: string) {
  return actionTerms.filter(
    (term) => containsAny(left, [term]) && containsAny(right, [term]),
  );
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippetFor(text: string, index: number, length: number) {
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + length + 36);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
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
      missingTestabilityTitle: "Saknar testbar struktur",
      missingTestabilityDetail: (gaps: string[]) =>
        `Kravet saknar ${gaps.map((gap) => testabilityGapLabel(gap, "sv")).join(", ")}.`,
      missingTestabilityQuestion: (gaps: string[]) =>
        `Vilken ${gaps.map((gap) => testabilityGapLabel(gap, "sv")).join(", ")} ska kravet beskriva för att bli testbart?`,
      missingTestabilityDiagnostic: (gap: string) =>
        `Kravet saknar en tydlig ${testabilityGapLabel(gap, "sv")}.`,
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
      duplicateTitle: "Möjligt dubblettkrav",
      duplicateDetail: (title: string) =>
        `Kravet verkar överlappa kraftigt med "${title}".`,
      duplicateQuestion:
        "Ska dessa krav slås ihop, eller vilken skillnad ska vara kvar?",
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
    missingTestabilityTitle: "Missing testable structure",
    missingTestabilityDetail: (gaps: string[]) =>
      `The requirement is missing ${gaps.map((gap) => testabilityGapLabel(gap, "en")).join(", ")}.`,
    missingTestabilityQuestion: (gaps: string[]) =>
      `What ${gaps.map((gap) => testabilityGapLabel(gap, "en")).join(", ")} should this requirement state to make it testable?`,
    missingTestabilityDiagnostic: (gap: string) =>
      `The requirement does not state a clear ${testabilityGapLabel(gap, "en")}.`,
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
    duplicateTitle: "Possible duplicate requirement",
    duplicateDetail: (title: string) =>
      `The requirement appears to overlap strongly with "${title}".`,
    duplicateQuestion:
      "Should these requirements be merged, or what distinction should remain?",
    missingNonFunctionalTitle: "Missing non-functional concern",
    missingNonFunctionalDetail:
      "No non-functional need such as security, performance, availability, or data quality has been captured.",
    missingNonFunctionalQuestion:
      "Which non-functional aspect matters most to secure first: security, performance, availability, or data quality?",
  };
}

function testabilityGapLabel(gap: string, language: WorkshopLanguage) {
  if (language === "sv") {
    if (gap === "actor") {
      return "aktör";
    }

    if (gap === "action") {
      return "handling";
    }

    return "resultat";
  }

  if (gap === "actor") {
    return "actor";
  }

  if (gap === "action") {
    return "action";
  }

  return "outcome";
}
