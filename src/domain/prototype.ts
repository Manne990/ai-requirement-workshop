import type { Requirement } from "./requirements";
import {
  participantIds,
  type ArtifactLink,
  type ArtifactType,
  type WorkshopArtifact,
  type WorkshopMessage,
  type WorkshopSession,
} from "./workshop";
import type { TraceabilityWorkItem } from "./traceability";

export type PrototypeStatus =
  "generated" | "in-review" | "approved" | "superseded";

export type PrototypeElementKind =
  "summary" | "dashboard" | "form" | "table" | "flow" | "detail";

export type PrototypeFeedbackIntent =
  "comment" | "question" | "risk" | "change-request" | "new-requirement";

export type PrototypeSourceModel = {
  provider: "local" | "codex" | "openai" | "manual";
  model: string;
  promptVersion: string;
  generatedBy: string;
};

export type PrototypeRequirementRef = {
  requirementId: string;
  title: string;
  statement: string;
  state: string;
  sourceArtifactId?: string;
  sourceMessageId?: string;
  version?: number;
};

export type PrototypeElementField = {
  id: string;
  label: string;
  value?: string;
};

export type PrototypeElement = {
  id: string;
  kind: PrototypeElementKind;
  title: string;
  body: string;
  requirementIds: string[];
  fields: PrototypeElementField[];
  actions: string[];
};

export type PrototypeCoverageItem = {
  requirementId: string;
  requirementTitle: string;
  status: "covered" | "not-covered";
  elementIds: string[];
};

export type PrototypeVersion = {
  id: string;
  version: number;
  status: PrototypeStatus;
  title: string;
  generatedAt: string;
  generatedBy: string;
  sourceModel: PrototypeSourceModel;
  requirementRefs: PrototypeRequirementRef[];
  coverage: PrototypeCoverageItem[];
  elements: PrototypeElement[];
  changeSummary: string;
};

export type PrototypeFeedbackEvidence = {
  messageId: string;
  artifactIds: string[];
  sourceRequirementIds: string[];
};

export type PrototypeFeedback = {
  id: string;
  prototypeId: string;
  prototypeVersionId: string;
  elementId?: string;
  body: string;
  intent: PrototypeFeedbackIntent;
  actorId: string;
  createdAt: string;
  evidence: PrototypeFeedbackEvidence;
};

export type Prototype = {
  id: string;
  workshopId: string;
  title: string;
  status: PrototypeStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versions: PrototypeVersion[];
  feedback: PrototypeFeedback[];
};

export type GeneratePrototypeOptions = {
  prototypeId?: string;
  title?: string;
  actorId?: string;
  at?: string;
  sourceModel?: Partial<PrototypeSourceModel>;
};

export type PrototypeFeedbackInput = {
  prototypeId: string;
  prototypeVersionId?: string;
  elementId?: string;
  body: string;
  intent?: PrototypeFeedbackIntent;
  requirementIds?: string[];
};

export type PrototypeFeedbackOptions = {
  actorId?: string;
  at?: string;
};

const now = () => new Date().toISOString();

export function selectPrototypeRequirementRefs(
  session: WorkshopSession,
): PrototypeRequirementRef[] {
  return session.artifacts
    .filter(
      (artifact) =>
        artifact.type === "requirement" &&
        (artifact.status === "accepted" || artifact.status === "draft"),
    )
    .map(prototypeRequirementRefFromArtifact);
}

export function prototypeRequirementRefFromArtifact(
  artifact: WorkshopArtifact,
): PrototypeRequirementRef {
  if (artifact.type !== "requirement") {
    throw new Error(
      `Only requirement artifacts can source a prototype; received ${artifact.type}.`,
    );
  }

  return {
    requirementId: artifact.id,
    title: artifact.title,
    statement: artifact.content,
    state: artifact.status === "accepted" ? "approved" : "candidate",
    sourceArtifactId: artifact.id,
    sourceMessageId: artifact.source.messageId,
  };
}

export function prototypeRequirementRefFromRequirement(
  requirement: Requirement,
): PrototypeRequirementRef {
  const sourceArtifact = requirement.sourceRefs.find(
    (source) => source.artifactId,
  );
  const sourceMessage = requirement.sourceRefs.find(
    (source) => source.messageId,
  );

  return {
    requirementId: requirement.id,
    title: requirement.title,
    statement: requirement.statement,
    state: requirement.state,
    sourceArtifactId: sourceArtifact?.artifactId,
    sourceMessageId: sourceMessage?.messageId,
    version: requirement.version,
  };
}

export function generatePrototypeFromWorkshop(
  session: WorkshopSession,
  options: GeneratePrototypeOptions = {},
): WorkshopSession {
  const requirementRefs = selectPrototypeRequirementRefs(session);
  const prototypes = session.prototypes ?? [];
  const currentPrototype = selectCurrentPrototype({ ...session, prototypes });
  const generatedAt = options.at ?? now();
  const nextPrototype = currentPrototype
    ? addPrototypeVersion(currentPrototype, requirementRefs, {
        ...options,
        at: generatedAt,
      })
    : createPrototype(session.id, requirementRefs, {
        ...options,
        prototypeId:
          options.prototypeId ??
          createPrototypeId(session.id, prototypes.length + 1),
        at: generatedAt,
      });

  return {
    ...session,
    prototypes: replacePrototype(prototypes, nextPrototype),
    updatedAt: generatedAt,
  };
}

export function createPrototype(
  workshopId: string,
  requirementRefs: PrototypeRequirementRef[],
  options: GeneratePrototypeOptions = {},
): Prototype {
  assertRequirementRefs(requirementRefs);
  const createdAt = options.at ?? now();
  const id =
    options.prototypeId ?? createPrototypeId(workshopId, Date.now() % 1000);
  const title = normalizeOptionalText(options.title) ?? "Workshop prototype";
  const version = createPrototypeVersion(id, 1, requirementRefs, {
    ...options,
    title,
    at: createdAt,
  });

  return {
    id,
    workshopId,
    title,
    status: version.status,
    currentVersion: version.version,
    createdAt,
    updatedAt: createdAt,
    versions: [version],
    feedback: [],
  };
}

export function addPrototypeVersion(
  prototype: Prototype,
  requirementRefs: PrototypeRequirementRef[],
  options: GeneratePrototypeOptions = {},
): Prototype {
  assertRequirementRefs(requirementRefs);
  const generatedAt = options.at ?? now();
  const nextVersionNumber = prototype.currentVersion + 1;
  const nextVersion = createPrototypeVersion(
    prototype.id,
    nextVersionNumber,
    requirementRefs,
    {
      ...options,
      title: options.title ?? prototype.title,
      at: generatedAt,
    },
  );

  return {
    ...prototype,
    status: nextVersion.status,
    currentVersion: nextVersion.version,
    updatedAt: generatedAt,
    versions: [
      ...prototype.versions.map((version) =>
        version.version === prototype.currentVersion
          ? { ...version, status: "superseded" as const }
          : version,
      ),
      nextVersion,
    ],
  };
}

export function selectCurrentPrototype(
  session: WorkshopSession,
): Prototype | undefined {
  return (session.prototypes ?? []).at(-1);
}

export function getCurrentPrototypeVersion(
  prototype: Prototype,
): PrototypeVersion {
  const version = prototype.versions.find(
    (candidate) => candidate.version === prototype.currentVersion,
  );
  if (!version) {
    throw new Error(`Prototype ${prototype.id} has no current version.`);
  }

  return version;
}

export function calculatePrototypeCoverage(
  version: PrototypeVersion,
  requirementRefs: PrototypeRequirementRef[] = version.requirementRefs,
): PrototypeCoverageItem[] {
  return requirementRefs.map((requirement) => {
    const elementIds = version.elements
      .filter((element) =>
        element.requirementIds.includes(requirement.requirementId),
      )
      .map((element) => element.id);

    return {
      requirementId: requirement.requirementId,
      requirementTitle: requirement.title,
      status: elementIds.length > 0 ? "covered" : "not-covered",
      elementIds,
    };
  });
}

export function prototypeToTraceabilityWorkItem(
  prototype: Prototype,
): TraceabilityWorkItem {
  const version = getCurrentPrototypeVersion(prototype);

  return {
    id: prototype.id,
    kind: "prototype",
    title: `${prototype.title} v${version.version}`,
    summary: version.changeSummary,
    status: prototype.status,
    sourceRefs: version.requirementRefs.flatMap((requirement) =>
      requirement.sourceMessageId
        ? [{ messageId: requirement.sourceMessageId }]
        : [],
    ),
    covers: version.requirementRefs.map(
      (requirement) => requirement.requirementId,
    ),
    tags: [
      "prototype",
      `model:${version.sourceModel.model}`,
      `prompt:${version.sourceModel.promptVersion}`,
    ],
  };
}

export function renderPrototypePreviewHtml(version: PrototypeVersion): string {
  const elements = version.elements.map(renderPrototypeElement).join("");
  const requirements = version.coverage.map(renderCoverageBadge).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#162033}
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f8fafc}.shell{max-width:1080px;margin:0 auto;display:grid;gap:16px}
.hero,.panel{border:1px solid #d8e0ea;border-radius:8px;background:#fff;box-shadow:0 12px 28px rgba(15,23,42,.08)}
.hero{padding:22px;background:linear-gradient(135deg,#eefaf4,#edf7ff)}h1,h2,h3,p{margin:0}h1{font-size:28px;line-height:1.08;color:#102033}
.meta{margin-top:8px;color:#526174;font-size:13px}.coverage{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.badge{border:1px solid #bdd7c6;border-radius:999px;padding:5px 9px;background:#f1fbf4;color:#215234;font-size:12px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.panel{padding:16px;display:grid;gap:10px}.kind{color:#2563eb;font-size:11px;font-weight:800;text-transform:uppercase}
.body{color:#46556a;line-height:1.45}.fields{display:grid;gap:7px}.field{display:flex;justify-content:space-between;gap:12px;border:1px solid #e2e8f0;border-radius:7px;padding:8px;background:#f8fafc;color:#334155;font-size:13px}
.actions{display:flex;flex-wrap:wrap;gap:8px}.action{border-radius:7px;padding:7px 10px;background:#0f766e;color:white;font-size:12px;font-weight:800}
</style>
<title>${escapeHtml(version.title)}</title>
</head>
<body>
<main class="shell">
<section class="hero">
<h1>${escapeHtml(version.title)}</h1>
<p class="meta">Version ${version.version} generated ${escapeHtml(formatDate(version.generatedAt))} with ${escapeHtml(version.sourceModel.model)}. Implements ${version.requirementRefs.length} requirement${version.requirementRefs.length === 1 ? "" : "s"}.</p>
<div class="coverage">${requirements}</div>
</section>
<section class="grid" aria-label="Prototype elements">${elements}</section>
</main>
</body>
</html>`;
}

export function recordPrototypeFeedback(
  session: WorkshopSession,
  input: PrototypeFeedbackInput,
  options: PrototypeFeedbackOptions = {},
): WorkshopSession {
  const feedbackBody = assertNonEmpty(input.body, "Prototype feedback");
  const prototypes = session.prototypes ?? [];
  const prototypeIndex = prototypes.findIndex(
    (prototype) => prototype.id === input.prototypeId,
  );
  if (prototypeIndex < 0) {
    throw new Error(`Prototype ${input.prototypeId} could not be found.`);
  }

  const prototype = prototypes[prototypeIndex];
  if (!prototype) {
    throw new Error(`Prototype ${input.prototypeId} could not be found.`);
  }

  const version = input.prototypeVersionId
    ? prototype.versions.find(
        (candidate) => candidate.id === input.prototypeVersionId,
      )
    : getCurrentPrototypeVersion(prototype);
  if (!version) {
    throw new Error(
      `Prototype version ${input.prototypeVersionId} could not be found.`,
    );
  }

  const element = input.elementId
    ? version.elements.find((candidate) => candidate.id === input.elementId)
    : undefined;
  if (input.elementId && !element) {
    throw new Error(`Prototype element ${input.elementId} could not be found.`);
  }

  const createdAt = options.at ?? now();
  const actorId = options.actorId ?? participantIds.human;
  const targetRequirementIds = normalizeTargetRequirementIds(
    input.requirementIds ?? element?.requirementIds ?? [],
    version,
  );
  const intent = input.intent ?? inferPrototypeFeedbackIntent(feedbackBody);
  const artifactDrafts = createFeedbackArtifactDrafts(
    feedbackBody,
    intent,
    version,
    element,
    targetRequirementIds,
  );
  const messageId = createId("message", session.messages.length + 1);
  const artifacts = artifactDrafts.map((draft, index) =>
    createFeedbackArtifact(
      draft,
      session.artifacts.length + index + 1,
      actorId,
      messageId,
      createdAt,
      targetRequirementIds[0],
    ),
  );
  const artifactIds = artifacts.map((artifact) => artifact.id);
  const feedback: PrototypeFeedback = {
    id: createId("prototype-feedback", prototype.feedback.length + 1),
    prototypeId: prototype.id,
    prototypeVersionId: version.id,
    elementId: element?.id,
    body: feedbackBody,
    intent,
    actorId,
    createdAt,
    evidence: {
      messageId,
      artifactIds,
      sourceRequirementIds: targetRequirementIds,
    },
  };

  const humanMessage: WorkshopMessage = {
    id: messageId,
    participantId: actorId,
    kind: "human-input",
    body: feedbackMessageBody(prototype, element, feedbackBody),
    createdAt,
    relatedArtifactIds: artifactIds,
  };
  const facilitatorMessage: WorkshopMessage = {
    id: createId("message", session.messages.length + 2),
    participantId: participantIds.facilitator,
    kind: "facilitator-guidance",
    body: nextQuestionForFeedback(intent, targetRequirementIds, version),
    createdAt,
    relatedArtifactIds: artifactIds.filter((artifactId) =>
      artifacts.some(
        (artifact) =>
          artifact.id === artifactId &&
          (artifact.type === "question" || artifact.type === "requirement"),
      ),
    ),
  };
  const nextPrototype = {
    ...prototype,
    status: "in-review" as const,
    updatedAt: createdAt,
    versions: prototype.versions.map((candidate) =>
      candidate.id === version.id && candidate.status === "generated"
        ? { ...candidate, status: "in-review" as const }
        : candidate,
    ),
    feedback: [...prototype.feedback, feedback],
  };

  return {
    ...session,
    messages: [...session.messages, humanMessage, facilitatorMessage],
    artifacts: [...session.artifacts, ...artifacts],
    links: [
      ...session.links,
      ...createFeedbackLinks(
        session,
        targetRequirementIds,
        artifacts,
        session.links.length + 1,
      ),
    ],
    prototypes: prototypes.map((candidate, index) =>
      index === prototypeIndex ? nextPrototype : candidate,
    ),
    selectedArtifactId: artifacts.at(-1)?.id ?? session.selectedArtifactId,
    updatedAt: createdAt,
  };
}

export function inferPrototypeFeedbackIntent(
  body: string,
): PrototypeFeedbackIntent {
  const normalized = body.toLocaleLowerCase();

  if (
    /\b(risk|concern|unsafe|privacy|security|fail|failure|wrong|stale)\b/.test(
      normalized,
    )
  ) {
    return "risk";
  }

  if (
    /[?]/.test(normalized) ||
    /^(what|how|which|why|when|where|can)\b/.test(normalized)
  ) {
    return "question";
  }

  if (/\b(add|include|missing|also need|new requirement)\b/.test(normalized)) {
    return "new-requirement";
  }

  if (
    /\b(change|replace|instead|must|should|need|require)\b/.test(normalized)
  ) {
    return "change-request";
  }

  return "comment";
}

function createPrototypeVersion(
  prototypeId: string,
  versionNumber: number,
  requirementRefs: PrototypeRequirementRef[],
  options: GeneratePrototypeOptions,
): PrototypeVersion {
  const generatedAt = options.at ?? now();
  const generatedBy = options.actorId ?? participantIds.facilitator;
  const sourceModel = normalizeSourceModel(options.sourceModel, generatedBy);
  const title = `${normalizeOptionalText(options.title) ?? "Workshop prototype"} v${versionNumber}`;
  const elements = buildPrototypeElements(requirementRefs, versionNumber);
  const draftVersion = {
    id: `${prototypeId}:version-${versionNumber}`,
    version: versionNumber,
    status: "generated" as const,
    title,
    generatedAt,
    generatedBy,
    sourceModel,
    requirementRefs,
    coverage: [],
    elements,
    changeSummary:
      versionNumber === 1
        ? "Initial generated prototype from workshop requirements."
        : "Regenerated prototype from the current requirement set.",
  };

  return {
    ...draftVersion,
    coverage: calculatePrototypeCoverage(draftVersion),
  };
}

function buildPrototypeElements(
  requirementRefs: PrototypeRequirementRef[],
  versionNumber: number,
): PrototypeElement[] {
  const summary: PrototypeElement = {
    id: createElementId(versionNumber, 1),
    kind: "summary",
    title: "Operating overview",
    body: summarizeRequirements(requirementRefs),
    requirementIds: requirementRefs.map(
      (requirement) => requirement.requirementId,
    ),
    fields: requirementRefs.slice(0, 3).map((requirement, index) => ({
      id: `summary-field-${index + 1}`,
      label: requirement.title,
      value: requirement.state,
    })),
    actions: ["Review coverage", "Collect feedback"],
  };

  return [
    summary,
    ...requirementRefs.map((requirement, index) =>
      elementForRequirement(requirement, versionNumber, index + 2),
    ),
  ];
}

function elementForRequirement(
  requirement: PrototypeRequirementRef,
  versionNumber: number,
  elementIndex: number,
): PrototypeElement {
  const statement = requirement.statement;
  const kind = inferElementKind(statement);

  return {
    id: createElementId(versionNumber, elementIndex),
    kind,
    title: requirement.title,
    body: statement,
    requirementIds: [requirement.requirementId],
    fields: fieldsForRequirement(requirement, kind),
    actions: actionsForKind(kind),
  };
}

function inferElementKind(statement: string): PrototypeElementKind {
  const normalized = statement.toLocaleLowerCase();
  if (/\b(form|input|submit|enter|capture)\b/.test(normalized)) {
    return "form";
  }
  if (/\b(table|list|record|report|history)\b/.test(normalized)) {
    return "table";
  }
  if (/\b(flow|step|journey|process|handover)\b/.test(normalized)) {
    return "flow";
  }
  if (
    /\b(status|dashboard|metric|summary|overview|monitor)\b/.test(normalized)
  ) {
    return "dashboard";
  }

  return "detail";
}

function fieldsForRequirement(
  requirement: PrototypeRequirementRef,
  kind: PrototypeElementKind,
): PrototypeElementField[] {
  if (kind === "form") {
    return [
      {
        id: `${requirement.requirementId}:field-1`,
        label: "Input",
        value: "Required",
      },
      {
        id: `${requirement.requirementId}:field-2`,
        label: "Validation",
        value: "Pending review",
      },
    ];
  }

  if (kind === "dashboard") {
    return [
      {
        id: `${requirement.requirementId}:field-1`,
        label: "Status",
        value: "Live",
      },
      {
        id: `${requirement.requirementId}:field-2`,
        label: "Confidence",
        value: "Needs data source",
      },
    ];
  }

  if (kind === "flow") {
    return [
      {
        id: `${requirement.requirementId}:field-1`,
        label: "Step 1",
        value: "Start",
      },
      {
        id: `${requirement.requirementId}:field-2`,
        label: "Step 2",
        value: "Confirm",
      },
    ];
  }

  return [
    {
      id: `${requirement.requirementId}:field-1`,
      label: "Requirement",
      value: requirement.state,
    },
    {
      id: `${requirement.requirementId}:field-2`,
      label: "Review state",
      value: "Ready for feedback",
    },
  ];
}

function actionsForKind(kind: PrototypeElementKind) {
  if (kind === "form") {
    return ["Save draft", "Validate"];
  }

  if (kind === "flow") {
    return ["Continue", "Back"];
  }

  if (kind === "table") {
    return ["Filter", "Export"];
  }

  return ["Inspect", "Decide"];
}

function createFeedbackArtifactDrafts(
  body: string,
  intent: PrototypeFeedbackIntent,
  version: PrototypeVersion,
  element: PrototypeElement | undefined,
  requirementIds: string[],
) {
  const targetTitle = feedbackTargetTitle(version, element, requirementIds);
  const baseTags = [
    "prototype-feedback",
    `prototype-version:${version.version}`,
    intent,
  ];

  if (intent === "risk") {
    return [
      {
        type: "risk" as const,
        title: `Prototype risk: ${targetTitle}`,
        content: body,
        createdBy: participantIds.risk,
        tags: baseTags,
      },
    ];
  }

  if (intent === "question" || intent === "comment") {
    return [
      {
        type: "question" as const,
        title: `Prototype follow-up: ${targetTitle}`,
        content:
          intent === "question"
            ? body
            : `Clarify how this feedback should affect the prototype or requirements: ${body}`,
        createdBy: participantIds.facilitator,
        tags: baseTags,
      },
    ];
  }

  return [
    {
      type: "requirement" as const,
      title:
        intent === "new-requirement"
          ? `Requirement candidate from prototype feedback`
          : `Requirement change request: ${targetTitle}`,
      content: requirementFeedbackContent(body, version, requirementIds),
      createdBy: participantIds.quality,
      tags: [...baseTags, "requires-review"],
    },
  ];
}

function createFeedbackArtifact(
  draft: {
    type: ArtifactType;
    title: string;
    content: string;
    createdBy: string;
    tags: string[];
  },
  index: number,
  actorId: string,
  messageId: string,
  createdAt: string,
  sourceRequirementId?: string,
): WorkshopArtifact {
  return {
    id: createId(`artifact-${draft.type}`, index),
    type: draft.type,
    title: draft.title,
    content: draft.content,
    status: "draft",
    createdBy: draft.createdBy,
    updatedAt: createdAt,
    source: {
      messageId,
      artifactId: sourceRequirementId,
      participantId: actorId,
    },
    tags: [...new Set(draft.tags)].slice(0, 8),
  };
}

function createFeedbackLinks(
  session: WorkshopSession,
  requirementIds: string[],
  artifacts: WorkshopArtifact[],
  startIndex: number,
): ArtifactLink[] {
  const existingArtifactIds = new Set(
    session.artifacts.map((artifact) => artifact.id),
  );
  const sourceIds = requirementIds.filter((id) => existingArtifactIds.has(id));
  const links: ArtifactLink[] = [];

  for (const sourceId of sourceIds) {
    for (const artifact of artifacts) {
      links.push({
        id: createId("link", startIndex + links.length),
        sourceArtifactId: sourceId,
        targetArtifactId: artifact.id,
        label: "prototype feedback",
      });
    }
  }

  return links;
}

function feedbackMessageBody(
  prototype: Prototype,
  element: PrototypeElement | undefined,
  body: string,
) {
  return element
    ? `Prototype feedback on ${prototype.title} / ${element.title}: ${body}`
    : `Prototype feedback on ${prototype.title}: ${body}`;
}

function nextQuestionForFeedback(
  intent: PrototypeFeedbackIntent,
  requirementIds: string[],
  version: PrototypeVersion,
) {
  const target =
    requirementIds
      .map(
        (id) =>
          version.requirementRefs.find(
            (requirement) => requirement.requirementId === id,
          )?.title,
      )
      .find(Boolean) ?? "this prototype area";

  if (intent === "risk") {
    return `What mitigation or acceptance check should we attach to ${target}?`;
  }

  if (intent === "question") {
    return `What answer would let us update ${target} with confidence?`;
  }

  if (intent === "new-requirement") {
    return `What observable acceptance criterion would prove this new requirement is met?`;
  }

  if (intent === "change-request") {
    return `Should this become a reviewed replacement requirement for ${target}?`;
  }

  return `What should change in the next prototype version for ${target}?`;
}

function requirementFeedbackContent(
  body: string,
  version: PrototypeVersion,
  requirementIds: string[],
) {
  const targets = requirementIds
    .map(
      (id) =>
        version.requirementRefs.find(
          (requirement) => requirement.requirementId === id,
        )?.title,
    )
    .filter((title): title is string => Boolean(title));

  if (targets.length === 0) {
    return `Human prototype feedback proposed a new requirement candidate: ${body}`;
  }

  return `Human prototype feedback proposed a reviewed requirement change for ${targets.join(", ")}. Do not mutate approved requirements silently; review this as a candidate update or superseding requirement. Feedback: ${body}`;
}

function feedbackTargetTitle(
  version: PrototypeVersion,
  element: PrototypeElement | undefined,
  requirementIds: string[],
) {
  if (element) {
    return element.title;
  }

  const requirementTitle = requirementIds
    .map(
      (id) =>
        version.requirementRefs.find(
          (requirement) => requirement.requirementId === id,
        )?.title,
    )
    .find(Boolean);

  return requirementTitle ?? "prototype";
}

function normalizeTargetRequirementIds(
  requirementIds: string[],
  version: PrototypeVersion,
) {
  const known = new Set(
    version.requirementRefs.map((requirement) => requirement.requirementId),
  );

  return [...new Set(requirementIds)]
    .map((id) => id.trim())
    .filter((id) => known.has(id));
}

function assertRequirementRefs(requirementRefs: PrototypeRequirementRef[]) {
  if (requirementRefs.length === 0) {
    throw new Error(
      "Generating a prototype requires at least one approved or candidate requirement.",
    );
  }
}

function normalizeSourceModel(
  sourceModel: Partial<PrototypeSourceModel> | undefined,
  generatedBy: string,
): PrototypeSourceModel {
  return {
    provider: sourceModel?.provider ?? "local",
    model:
      normalizeOptionalText(sourceModel?.model) ?? "structured-prototype-v1",
    promptVersion:
      normalizeOptionalText(sourceModel?.promptVersion) ??
      "prototype-generation-v1",
    generatedBy: normalizeOptionalText(sourceModel?.generatedBy) ?? generatedBy,
  };
}

function summarizeRequirements(requirementRefs: PrototypeRequirementRef[]) {
  const first = requirementRefs[0];
  if (!first) {
    return "Prototype generated from workshop requirements.";
  }

  return `${first.statement}${requirementRefs.length > 1 ? ` ${requirementRefs.length - 1} more requirement${requirementRefs.length === 2 ? "" : "s"} are represented in the preview.` : ""}`;
}

function renderPrototypeElement(element: PrototypeElement) {
  return `<article class="panel" data-prototype-element-id="${escapeHtml(element.id)}">
<span class="kind">${escapeHtml(element.kind)}</span>
<h2>${escapeHtml(element.title)}</h2>
<p class="body">${escapeHtml(element.body)}</p>
<div class="fields">${element.fields.map(renderField).join("")}</div>
<div class="actions">${element.actions.map((action) => `<span class="action">${escapeHtml(action)}</span>`).join("")}</div>
</article>`;
}

function renderField(field: PrototypeElementField) {
  return `<div class="field"><strong>${escapeHtml(field.label)}</strong><span>${escapeHtml(field.value ?? "")}</span></div>`;
}

function renderCoverageBadge(coverage: PrototypeCoverageItem) {
  return `<span class="badge">${escapeHtml(coverage.requirementTitle)}: ${escapeHtml(coverage.status)}</span>`;
}

function replacePrototype(prototypes: Prototype[], nextPrototype: Prototype) {
  const existingIndex = prototypes.findIndex(
    (prototype) => prototype.id === nextPrototype.id,
  );
  if (existingIndex < 0) {
    return [...prototypes, nextPrototype];
  }

  return prototypes.map((prototype, index) =>
    index === existingIndex ? nextPrototype : prototype,
  );
}

function createPrototypeId(workshopId: string, index: number) {
  const stableWorkshopId =
    workshopId
      .toLocaleLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 42) || "workshop";

  return `prototype-${stableWorkshopId}-${String(index).padStart(3, "0")}`;
}

function createElementId(versionNumber: number, elementIndex: number) {
  return `prototype-element-v${versionNumber}-${String(elementIndex).padStart(2, "0")}`;
}

function createId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertNonEmpty(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
