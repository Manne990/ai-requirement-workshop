import {
  participantIds,
  type ArtifactLink,
  type ArtifactStatus,
  type ArtifactType,
  type WorkshopArtifact,
  type WorkshopSession,
} from "./workshop";

export type RequirementConsolidationDraft = {
  title: string;
  content: string;
};

export type ArtifactConsolidationSuggestion = {
  id: string;
  kind: "merge" | "split";
  sourceArtifactIds: string[];
  proposedRequirements: RequirementConsolidationDraft[];
  rationale: string;
  confidence: number;
  status: "pending";
};

export type ConsolidationSuggestionOptions = {
  maxSuggestions?: number;
  minSimilarity?: number;
};

export type MergeArtifactsOptions = {
  title?: string;
  content?: string;
  status?: ArtifactStatus;
  sourceStatus?: ArtifactStatus;
  createdBy?: string;
  tags?: string[];
};

export type SplitArtifactOptions = {
  status?: ArtifactStatus;
  sourceStatus?: ArtifactStatus;
  createdBy?: string;
  tags?: string[];
};

const now = () => new Date().toISOString();

const requirementLikeTypes = new Set<ArtifactType>([
  "requirement",
  "assumption",
  "decision",
  "flow-step",
  "question",
]);

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "before",
  "can",
  "each",
  "for",
  "from",
  "have",
  "into",
  "must",
  "need",
  "needs",
  "should",
  "show",
  "that",
  "the",
  "their",
  "this",
  "with",
]);

export function suggestArtifactConsolidations(
  artifacts: WorkshopArtifact[],
  options: ConsolidationSuggestionOptions = {},
): ArtifactConsolidationSuggestion[] {
  const maxSuggestions = options.maxSuggestions ?? 5;
  const minSimilarity = options.minSimilarity ?? 0.38;
  const candidates = artifacts.filter(isDraftRequirementMaterial);
  const suggestions: ArtifactConsolidationSuggestion[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const artifact = candidates[index];
    if (!artifact) {
      continue;
    }

    const splitDrafts = inferRequirementSplits(artifact);
    if (splitDrafts.length > 1) {
      suggestions.push({
        id: `consolidation-split-${artifact.id}`,
        kind: "split",
        sourceArtifactIds: [artifact.id],
        proposedRequirements: splitDrafts,
        rationale:
          "The artifact appears to contain multiple requirement clauses.",
        confidence: clampConfidence(0.56 + splitDrafts.length * 0.08),
        status: "pending",
      });
    }

    for (
      let otherIndex = index + 1;
      otherIndex < candidates.length;
      otherIndex += 1
    ) {
      const other = candidates[otherIndex];
      if (!other) {
        continue;
      }

      const similarity = artifactSimilarity(artifact, other);
      if (similarity < minSimilarity) {
        continue;
      }

      suggestions.push({
        id: `consolidation-merge-${artifact.id}-${other.id}`,
        kind: "merge",
        sourceArtifactIds: [artifact.id, other.id],
        proposedRequirements: [buildRequirementDraft([artifact, other])],
        rationale:
          "The artifacts share enough requirement language to be reviewed as overlapping candidates.",
        confidence: clampConfidence(similarity),
        status: "pending",
      });
    }
  }

  return suggestions
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxSuggestions);
}

export function mergeArtifactsIntoRequirement(
  session: WorkshopSession,
  sourceArtifactIds: string[],
  options: MergeArtifactsOptions = {},
  updatedAt = now(),
): WorkshopSession {
  const sources = readDraftSources(session, sourceArtifactIds, 2);
  const sourceIds = new Set(sources.map((artifact) => artifact.id));
  const requirement = createRequirementArtifact(
    session.artifacts.length + 1,
    sources[0],
    {
      ...buildRequirementDraft(sources),
      ...compactDraft({
        title: options.title,
        content: options.content,
      }),
    },
    {
      status: options.status ?? "accepted",
      createdBy: options.createdBy ?? participantIds.facilitator,
      tags: ["consolidated", "merged", ...(options.tags ?? [])],
    },
    updatedAt,
  );
  const links = createProvenanceLinks(
    sources.map((artifact) => artifact.id),
    requirement.id,
    "merged into",
    session.links.length + 1,
  );

  return {
    ...session,
    artifacts: [
      ...session.artifacts.map((artifact) =>
        sourceIds.has(artifact.id)
          ? markSourceArtifact(
              artifact,
              options.sourceStatus ?? "parked",
              ["merged"],
              updatedAt,
            )
          : artifact,
      ),
      requirement,
    ],
    links: [...session.links, ...links],
    selectedArtifactId: requirement.id,
    updatedAt,
  };
}

export function splitArtifactIntoRequirements(
  session: WorkshopSession,
  sourceArtifactId: string,
  requirements: RequirementConsolidationDraft[],
  options: SplitArtifactOptions = {},
  updatedAt = now(),
): WorkshopSession {
  const [source] = readDraftSources(session, [sourceArtifactId], 1);
  if (!source) {
    throw new Error(`Artifact ${sourceArtifactId} could not be found.`);
  }

  const drafts = requirements
    .map(normalizeRequirementDraft)
    .filter(
      (draft): draft is RequirementConsolidationDraft => draft !== undefined,
    );
  if (drafts.length < 2) {
    throw new Error(
      "Splitting an artifact requires at least two requirements.",
    );
  }

  const createdBy = options.createdBy ?? participantIds.facilitator;
  const newArtifacts = drafts.map((draft, index) =>
    createRequirementArtifact(
      session.artifacts.length + index + 1,
      source,
      draft,
      {
        status: options.status ?? "accepted",
        createdBy,
        tags: ["consolidated", "split", ...(options.tags ?? [])],
      },
      updatedAt,
    ),
  );
  const links = newArtifacts.map((artifact, index) => ({
    id: createId("link", session.links.length + index + 1),
    sourceArtifactId: source.id,
    targetArtifactId: artifact.id,
    label: "split into",
  }));

  return {
    ...session,
    artifacts: [
      ...session.artifacts.map((artifact) =>
        artifact.id === source.id
          ? markSourceArtifact(
              artifact,
              options.sourceStatus ?? "parked",
              ["split"],
              updatedAt,
            )
          : artifact,
      ),
      ...newArtifacts,
    ],
    links: [...session.links, ...links],
    selectedArtifactId: newArtifacts.at(-1)?.id ?? session.selectedArtifactId,
    updatedAt,
  };
}

function isDraftRequirementMaterial(artifact: WorkshopArtifact) {
  return (
    artifact.status === "draft" &&
    (requirementLikeTypes.has(artifact.type) ||
      requirementLanguage(`${artifact.title} ${artifact.content}`))
  );
}

function readDraftSources(
  session: WorkshopSession,
  artifactIds: string[],
  minimumCount: number,
) {
  const uniqueIds = [
    ...new Set(artifactIds.map((artifactId) => artifactId.trim())),
  ].filter(Boolean);
  if (uniqueIds.length < minimumCount) {
    throw new Error(
      `Expected at least ${minimumCount} draft artifact source${minimumCount === 1 ? "" : "s"}.`,
    );
  }

  return uniqueIds.map((artifactId) => {
    const artifact = session.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} could not be found.`);
    }
    if (artifact.status !== "draft") {
      throw new Error(
        `Artifact ${artifactId} must be draft before consolidation.`,
      );
    }
    return artifact;
  });
}

function createRequirementArtifact(
  index: number,
  source: WorkshopArtifact,
  draft: RequirementConsolidationDraft,
  options: {
    status: ArtifactStatus;
    createdBy: string;
    tags: string[];
  },
  updatedAt: string,
): WorkshopArtifact {
  return {
    id: createId("artifact-requirement", index),
    type: "requirement",
    title: draft.title,
    content: draft.content,
    status: options.status,
    createdBy: options.createdBy,
    updatedAt,
    source: {
      artifactId: source.id,
      participantId: options.createdBy,
    },
    tags: [...new Set(options.tags)].slice(0, 8),
  };
}

function markSourceArtifact(
  artifact: WorkshopArtifact,
  status: ArtifactStatus,
  tags: string[],
  updatedAt: string,
): WorkshopArtifact {
  return {
    ...artifact,
    status,
    updatedAt,
    tags: [...new Set([...artifact.tags, ...tags])],
  };
}

function createProvenanceLinks(
  sourceArtifactIds: string[],
  targetArtifactId: string,
  label: string,
  startIndex: number,
): ArtifactLink[] {
  return sourceArtifactIds.map((sourceArtifactId, index) => ({
    id: createId("link", startIndex + index),
    sourceArtifactId,
    targetArtifactId,
    label,
  }));
}

function buildRequirementDraft(
  artifacts: WorkshopArtifact[],
): RequirementConsolidationDraft {
  const clauses = uniqueTexts(artifacts.flatMap(requirementClauses));
  const title = selectRequirementTitle(artifacts, clauses);

  return {
    title,
    content: clauses.join(" "),
  };
}

function compactDraft(
  draft: Partial<RequirementConsolidationDraft>,
): Partial<RequirementConsolidationDraft> {
  return {
    ...(draft.title?.trim() ? { title: draft.title.trim() } : {}),
    ...(draft.content?.trim() ? { content: draft.content.trim() } : {}),
  };
}

function normalizeRequirementDraft(
  draft: RequirementConsolidationDraft,
): RequirementConsolidationDraft | undefined {
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (!title || !content) {
    return undefined;
  }
  return { title, content };
}

function inferRequirementSplits(
  artifact: WorkshopArtifact,
): RequirementConsolidationDraft[] {
  const clauses = requirementClauses(artifact);
  if (clauses.length < 2) {
    return [];
  }

  return clauses.map((clause, index) => ({
    title: titleFromContent(clause, `Requirement ${index + 1}`),
    content: clause,
  }));
}

function requirementClauses(artifact: WorkshopArtifact) {
  return uniqueTexts(
    splitIntoClauses(artifact.content)
      .map(stripRequirementPrefix)
      .filter((clause) => clause.length > 0),
  );
}

function splitIntoClauses(content: string) {
  const lineParts = content
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/;\s+/))
    .map((line) => line.replace(/^[-*]?\s*\d*[.)]?\s*/, "").trim())
    .filter(Boolean);

  return lineParts.flatMap((part) => {
    const sentenceParts = part
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    return sentenceParts.flatMap(splitRepeatedModal);
  });
}

function splitRepeatedModal(sentence: string) {
  const parts = sentence.split(
    /\s+(?=(?:and|och)\s+(?:must|should|ska|måste|behöver)\b)/i,
  );
  if (parts.length < 2) {
    return [sentence.trim()];
  }

  return parts.map((part) => part.replace(/^(and|och)\s+/i, "").trim());
}

function stripRequirementPrefix(content: string) {
  return content
    .replace(/^the future solution should support:\s*/i, "")
    .replace(/^den framtida lösningen behöver stödja:\s*/i, "")
    .replace(/^requirement candidate:\s*/i, "")
    .trim();
}

function selectRequirementTitle(
  artifacts: WorkshopArtifact[],
  clauses: string[],
) {
  const title = artifacts
    .map((artifact) => artifact.title.trim())
    .find((candidate) => !isGenericRequirementTitle(candidate));

  return (
    title ?? titleFromContent(clauses[0] ?? "", "Consolidated requirement")
  );
}

function titleFromContent(content: string, fallback: string) {
  const words = stripRequirementPrefix(content)
    .replace(/[.:!?]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const title = words.join(" ");
  return title || fallback;
}

function isGenericRequirementTitle(title: string) {
  return /^(kravkandidat|requirement candidate|requirement)$/i.test(
    title.trim(),
  );
}

function artifactSimilarity(left: WorkshopArtifact, right: WorkshopArtifact) {
  const contentSimilarity = jaccardSimilarity(
    tokenize(`${left.title} ${left.content}`),
    tokenize(`${right.title} ${right.content}`),
  );
  const titleSimilarity = jaccardSimilarity(
    tokenize(left.title),
    tokenize(right.title),
  );

  return Math.max(
    contentSimilarity,
    contentSimilarity * 0.72 + titleSimilarity * 0.28,
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...left, ...right]).size;
}

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9åäö]+/gi, " ")
      .split(/\s+/)
      .map(stemToken)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function stemToken(token: string) {
  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

function requirementLanguage(text: string) {
  return /\b(must|should|shall|needs?|ska|måste|behöver)\b/i.test(text);
}

function clampConfidence(value: number) {
  return Math.min(0.95, Math.max(0.1, Number(value.toFixed(2))));
}

function createId(prefix: string, index: number) {
  return `${prefix}-${index}`;
}
