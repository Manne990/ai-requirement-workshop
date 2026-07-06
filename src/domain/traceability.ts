import type { WorkshopAttachment } from "./attachments";
import type {
  ArtifactLink,
  ArtifactStatus,
  ArtifactType,
  MessageKind,
  SourceRef,
  WorkshopArtifact,
  WorkshopMessage,
  WorkshopSession,
} from "./workshop";

export type TraceabilityNodeKind =
  | "source-message"
  | "source-attachment"
  | "artifact"
  | "requirement"
  | "risk"
  | "test"
  | "prototype";

export type TraceabilityWorkItemKind = Exclude<
  TraceabilityNodeKind,
  "source-message" | "source-attachment"
>;

export type TraceabilityLinkType =
  | "source-of"
  | "derived-from"
  | "artifact-link"
  | "covered-by"
  | "depends-on"
  | "implemented-by"
  | "mitigated-by"
  | "relates-to";

export type TraceabilitySourceRef = {
  messageId?: string;
  attachmentId?: string;
  artifactId?: string;
  nodeId?: string;
};

export type TraceabilityNode = {
  id: string;
  kind: TraceabilityNodeKind;
  entityId: string;
  label: string;
  summary: string;
  status?: ArtifactStatus | MessageKind | string;
  artifactType?: ArtifactType;
  source?: TraceabilitySourceRef & Partial<Pick<SourceRef, "participantId">>;
  tags: string[];
};

export type TraceabilityLink = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: TraceabilityLinkType;
  label: string;
};

export type TraceabilityWorkItem = {
  id: string;
  kind: TraceabilityWorkItemKind;
  title: string;
  summary?: string;
  status?: string;
  sourceRefs?: TraceabilitySourceRef[];
  covers?: string[];
  dependsOn?: string[];
  implements?: string[];
  mitigates?: string[];
  tags?: string[];
};

export type TraceabilityLinkDraft = {
  id?: string;
  sourceId: string;
  targetId: string;
  type?: TraceabilityLinkType;
  label?: string;
};

export type TraceabilityGraphInput = {
  workItems?: TraceabilityWorkItem[];
  links?: TraceabilityLinkDraft[];
};

export type TraceabilityGraph = {
  nodes: TraceabilityNode[];
  links: TraceabilityLink[];
  nodeAliases: Record<string, string>;
  warnings: string[];
};

export type TraceabilityImpactOptions = {
  maxDepth?: number;
  kinds?: TraceabilityNodeKind[];
};

export type TraceabilityImpact = {
  origin: TraceabilityNode;
  nodes: TraceabilityNode[];
  links: TraceabilityLink[];
  depthByNodeId: Record<string, number>;
};

export type TraceabilityCoverageExpectation = {
  id: string;
  targetKind: TraceabilityNodeKind;
  direction: "upstream" | "downstream";
  acceptedKinds: TraceabilityNodeKind[];
  acceptedArtifactTypes?: ArtifactType[];
  description: string;
  statuses?: string[];
};

export type TraceabilityCoverageGap = {
  expectationId: string;
  targetNodeId: string;
  targetKind: TraceabilityNodeKind;
  targetLabel: string;
  direction: "upstream" | "downstream";
  acceptedKinds: TraceabilityNodeKind[];
  detail: string;
};

export const defaultTraceabilityCoverageExpectations = [
  {
    id: "requirement-source",
    targetKind: "requirement",
    direction: "upstream",
    acceptedKinds: ["source-message", "source-attachment", "artifact"],
    acceptedArtifactTypes: ["source"],
    description: "source evidence",
  },
  {
    id: "requirement-test",
    targetKind: "requirement",
    direction: "downstream",
    acceptedKinds: ["test", "prototype"],
    description: "validation test or prototype coverage",
  },
  {
    id: "requirement-risk-review",
    targetKind: "requirement",
    direction: "downstream",
    acceptedKinds: ["risk"],
    description: "risk review",
  },
  {
    id: "risk-source",
    targetKind: "risk",
    direction: "upstream",
    acceptedKinds: ["source-message", "source-attachment", "artifact"],
    acceptedArtifactTypes: ["source"],
    description: "source evidence",
  },
  {
    id: "risk-test",
    targetKind: "risk",
    direction: "downstream",
    acceptedKinds: ["test"],
    description: "risk verification or monitoring coverage",
  },
  {
    id: "test-target",
    targetKind: "test",
    direction: "upstream",
    acceptedKinds: ["requirement", "risk"],
    description: "covered requirement or risk",
  },
  {
    id: "prototype-target",
    targetKind: "prototype",
    direction: "upstream",
    acceptedKinds: ["requirement"],
    description: "covered requirement",
  },
] satisfies TraceabilityCoverageExpectation[];

export function buildTraceabilityGraph(
  session: WorkshopSession,
  input: TraceabilityGraphInput = {},
): TraceabilityGraph {
  const nodesById = new Map<string, TraceabilityNode>();
  const linksByKey = new Map<string, TraceabilityLink>();
  const aliases = new Map<string, string>();
  const warnings: string[] = [];

  const addNode = (node: TraceabilityNode, aliasesForNode: string[] = []) => {
    if (!nodesById.has(node.id)) {
      nodesById.set(node.id, node);
    }

    registerAlias(aliases, node.id, node.id);
    aliasesForNode.forEach((alias) => registerAlias(aliases, alias, node.id));
  };

  const addLink = (
    sourceNodeId: string,
    targetNodeId: string,
    type: TraceabilityLinkType,
    label: string,
    id?: string,
  ) => {
    if (sourceNodeId === targetNodeId) {
      return;
    }

    const key = `${sourceNodeId}->${targetNodeId}:${type}:${label}`;
    if (linksByKey.has(key)) {
      return;
    }

    linksByKey.set(key, {
      id: id ?? `trace-link-${linksByKey.size + 1}`,
      sourceNodeId,
      targetNodeId,
      type,
      label,
    });
  };

  for (const message of session.messages) {
    addNode(messageNode(message), [message.id, `source-message:${message.id}`]);
  }

  for (const attachment of session.attachments ?? []) {
    addNode(attachmentNode(attachment), [
      attachment.id,
      `source-attachment:${attachment.id}`,
    ]);

    const messageNodeId = resolveReference(
      attachment.sourceMessageId,
      nodesById,
      aliases,
    );
    if (messageNodeId) {
      addLink(
        messageNodeId,
        traceabilityNodeId("source-attachment", attachment.id),
        "source-of",
        "attached",
      );
    }
  }

  for (const artifact of session.artifacts) {
    const node = artifactNode(artifact);
    addNode(node, [
      artifact.id,
      `artifact:${artifact.id}`,
      `${node.kind}:${artifact.id}`,
    ]);
  }

  linkArtifactSources(session, nodesById, aliases, addLink, warnings);
  linkAttachmentsToSourceArtifacts(
    session.attachments ?? [],
    session.artifacts,
    nodesById,
    aliases,
    addLink,
  );
  linkRequirementRiskReviews(session.artifacts, nodesById, aliases, addLink);
  linkWorkshopArtifactEdges(
    session.links,
    nodesById,
    aliases,
    addLink,
    warnings,
  );

  const workItems = [
    ...(input.workItems ?? []),
    ...prototypeWorkItems(session.prototypes ?? [], warnings),
  ];

  for (const workItem of workItems) {
    const node = workItemNode(workItem);
    addNode(node, [workItem.id, `${workItem.kind}:${workItem.id}`]);
  }

  for (const workItem of workItems) {
    const nodeId = resolveReference(
      `${workItem.kind}:${workItem.id}`,
      nodesById,
      aliases,
    );
    if (!nodeId) {
      continue;
    }

    linkWorkItemSources(
      workItem,
      nodeId,
      nodesById,
      aliases,
      addLink,
      warnings,
    );
    linkWorkItemCoverage(
      workItem,
      nodeId,
      nodesById,
      aliases,
      addLink,
      warnings,
    );
  }

  for (const link of input.links ?? []) {
    const sourceNodeId = resolveReference(link.sourceId, nodesById, aliases);
    const targetNodeId = resolveReference(link.targetId, nodesById, aliases);

    if (!sourceNodeId || !targetNodeId) {
      warnings.push(
        `Skipped trace link ${link.sourceId} -> ${link.targetId}: unresolved node reference.`,
      );
      continue;
    }

    addLink(
      sourceNodeId,
      targetNodeId,
      link.type ?? "relates-to",
      link.label ?? "relates to",
      link.id,
    );
  }

  return {
    nodes: [...nodesById.values()],
    links: [...linksByKey.values()],
    nodeAliases: Object.fromEntries(aliases),
    warnings,
  };
}

export function traceabilityNodeId(
  kind: TraceabilityNodeKind,
  entityId: string,
) {
  if (kind === "source-message") {
    return `message:${entityId}`;
  }

  if (kind === "source-attachment") {
    return `attachment:${entityId}`;
  }

  return `${kind}:${entityId}`;
}

export function getDownstreamImpact(
  graph: TraceabilityGraph,
  nodeIdOrAlias: string,
  options: TraceabilityImpactOptions = {},
): TraceabilityImpact {
  return traceImpact(graph, nodeIdOrAlias, "downstream", options);
}

export function getUpstreamImpact(
  graph: TraceabilityGraph,
  nodeIdOrAlias: string,
  options: TraceabilityImpactOptions = {},
): TraceabilityImpact {
  return traceImpact(graph, nodeIdOrAlias, "upstream", options);
}

export function findTraceabilityCoverageGaps(
  graph: TraceabilityGraph,
  expectations: TraceabilityCoverageExpectation[] = defaultTraceabilityCoverageExpectations,
): TraceabilityCoverageGap[] {
  return expectations.flatMap((expectation) =>
    graph.nodes
      .filter((node) => node.kind === expectation.targetKind)
      .filter((node) => matchesCoverageStatus(node, expectation))
      .flatMap((node) => coverageGapForNode(graph, node, expectation)),
  );
}

function messageNode(message: WorkshopMessage): TraceabilityNode {
  return {
    id: traceabilityNodeId("source-message", message.id),
    kind: "source-message",
    entityId: message.id,
    label: message.kind.replace("-", " "),
    summary: compactText(message.body),
    status: message.kind,
    source: {
      messageId: message.id,
      participantId: message.participantId,
    },
    tags: [message.kind],
  };
}

function attachmentNode(attachment: WorkshopAttachment): TraceabilityNode {
  return {
    id: traceabilityNodeId("source-attachment", attachment.id),
    kind: "source-attachment",
    entityId: attachment.id,
    label: attachment.name,
    summary: compactText(attachment.summary),
    status: attachment.status,
    source: {
      messageId: attachment.sourceMessageId,
      attachmentId: attachment.id,
    },
    tags: attachment.tags,
  };
}

function artifactNode(artifact: WorkshopArtifact): TraceabilityNode {
  const kind = artifactNodeKind(artifact);

  return {
    id: traceabilityNodeId(kind, artifact.id),
    kind,
    entityId: artifact.id,
    label: artifact.title,
    summary: compactText(artifact.content),
    status: artifact.status,
    artifactType: artifact.type,
    source: {
      messageId: artifact.source.messageId,
      artifactId: artifact.source.artifactId,
      participantId: artifact.source.participantId,
    },
    tags: artifact.tags,
  };
}

function workItemNode(workItem: TraceabilityWorkItem): TraceabilityNode {
  return {
    id: traceabilityNodeId(workItem.kind, workItem.id),
    kind: workItem.kind,
    entityId: workItem.id,
    label: workItem.title,
    summary: compactText(workItem.summary ?? workItem.title),
    status: workItem.status,
    tags: workItem.tags ?? [],
  };
}

function artifactNodeKind(artifact: Pick<WorkshopArtifact, "type">) {
  if (artifact.type === "requirement") {
    return "requirement";
  }

  if (artifact.type === "risk") {
    return "risk";
  }

  return "artifact";
}

function linkArtifactSources(
  session: WorkshopSession,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
  warnings: string[],
) {
  for (const message of session.messages) {
    const messageNodeId = resolveReference(message.id, nodesById, aliases);
    if (!messageNodeId) {
      continue;
    }

    for (const artifactId of message.relatedArtifactIds) {
      const artifactNodeId = resolveReference(artifactId, nodesById, aliases);
      if (artifactNodeId) {
        addLink(messageNodeId, artifactNodeId, "source-of", "mentioned");
      }
    }
  }

  for (const artifact of session.artifacts) {
    const targetNodeId = resolveReference(artifact.id, nodesById, aliases);
    if (!targetNodeId) {
      continue;
    }

    if (artifact.source.messageId) {
      const sourceNodeId = resolveReference(
        artifact.source.messageId,
        nodesById,
        aliases,
      );
      if (sourceNodeId) {
        addLink(sourceNodeId, targetNodeId, "source-of", "captured as");
      } else {
        warnings.push(
          `Skipped artifact provenance for ${artifact.type}:${artifact.id}: unresolved source message ${artifact.source.messageId}.`,
        );
      }
    }

    if (artifact.source.artifactId) {
      const sourceNodeId = resolveReference(
        artifact.source.artifactId,
        nodesById,
        aliases,
      );
      if (sourceNodeId) {
        addLink(sourceNodeId, targetNodeId, "derived-from", "derived");
      } else {
        warnings.push(
          `Skipped artifact provenance for ${artifact.type}:${artifact.id}: unresolved source artifact ${artifact.source.artifactId}.`,
        );
      }
    }
  }
}

function linkAttachmentsToSourceArtifacts(
  attachments: WorkshopAttachment[],
  artifacts: WorkshopArtifact[],
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
) {
  for (const attachment of attachments) {
    const sourceNodeId = resolveReference(attachment.id, nodesById, aliases);
    if (!sourceNodeId) {
      continue;
    }

    const sourceArtifact = artifacts.find(
      (artifact) =>
        artifact.type === "source" &&
        artifact.source.messageId === attachment.sourceMessageId &&
        artifact.title === attachment.name,
    );
    if (!sourceArtifact) {
      continue;
    }

    const targetNodeId = resolveReference(
      sourceArtifact.id,
      nodesById,
      aliases,
    );
    if (targetNodeId) {
      addLink(sourceNodeId, targetNodeId, "source-of", "extracted as");
    }
  }
}

function linkRequirementRiskReviews(
  artifacts: WorkshopArtifact[],
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
) {
  const requirements = artifacts.filter(
    (artifact) => artifact.type === "requirement",
  );
  const risks = artifacts.filter((artifact) => artifact.type === "risk");

  for (const requirement of requirements) {
    const requirementNodeId = resolveReference(
      requirement.id,
      nodesById,
      aliases,
    );
    if (!requirementNodeId) {
      continue;
    }

    for (const risk of risks) {
      const riskNodeId = resolveReference(risk.id, nodesById, aliases);
      if (!riskNodeId || !sharesTraceSource(requirement, risk)) {
        continue;
      }

      addLink(requirementNodeId, riskNodeId, "relates-to", "risk review");
    }
  }
}

function linkWorkshopArtifactEdges(
  links: ArtifactLink[],
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
  warnings: string[],
) {
  for (const link of links) {
    const sourceNodeId = resolveReference(
      link.sourceArtifactId,
      nodesById,
      aliases,
    );
    const targetNodeId = resolveReference(
      link.targetArtifactId,
      nodesById,
      aliases,
    );

    if (sourceNodeId && targetNodeId) {
      addLink(sourceNodeId, targetNodeId, "artifact-link", link.label, link.id);
    } else {
      warnings.push(
        `Skipped artifact link ${link.id}: unresolved artifact reference ${link.sourceArtifactId} -> ${link.targetArtifactId}.`,
      );
    }
  }
}

function prototypeWorkItems(
  prototypes: WorkshopSession["prototypes"],
  warnings: string[],
): TraceabilityWorkItem[] {
  return prototypes.flatMap((prototype) => {
    const version = prototype.versions.find(
      (candidate) => candidate.version === prototype.currentVersion,
    );
    if (!version) {
      warnings.push(
        `Skipped prototype ${prototype.id}: unresolved current version ${prototype.currentVersion}.`,
      );
      return [];
    }

    return [
      {
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
      },
    ];
  });
}

function linkWorkItemSources(
  workItem: TraceabilityWorkItem,
  nodeId: string,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
  warnings: string[],
) {
  for (const sourceRef of workItem.sourceRefs ?? []) {
    const sourceNodeId = resolveSourceRef(sourceRef, nodesById, aliases);
    if (!sourceNodeId) {
      warnings.push(
        `Skipped source reference for ${workItem.kind}:${workItem.id}: unresolved node reference.`,
      );
      continue;
    }

    addLink(sourceNodeId, nodeId, "source-of", "source evidence");
  }
}

function linkWorkItemCoverage(
  workItem: TraceabilityWorkItem,
  nodeId: string,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
  warnings: string[],
) {
  linkReferences(
    workItem.covers ?? [],
    nodeId,
    "covered-by",
    coverageLabel(workItem.kind),
    nodesById,
    aliases,
    addLink,
    warnings,
  );
  linkReferences(
    workItem.dependsOn ?? [],
    nodeId,
    "depends-on",
    "depends on",
    nodesById,
    aliases,
    addLink,
    warnings,
  );
  linkReferences(
    workItem.implements ?? [],
    nodeId,
    "implemented-by",
    "implemented by",
    nodesById,
    aliases,
    addLink,
    warnings,
  );
  linkReferences(
    workItem.mitigates ?? [],
    nodeId,
    "mitigated-by",
    "mitigated by",
    nodesById,
    aliases,
    addLink,
    warnings,
  );
}

function linkReferences(
  sourceIds: string[],
  targetNodeId: string,
  type: TraceabilityLinkType,
  label: string,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
  addLink: AddTraceabilityLink,
  warnings: string[],
) {
  for (const sourceId of sourceIds) {
    const sourceNodeId = resolveReference(sourceId, nodesById, aliases);
    if (!sourceNodeId) {
      warnings.push(
        `Skipped trace reference ${sourceId} -> ${targetNodeId}: unresolved node reference.`,
      );
      continue;
    }

    addLink(sourceNodeId, targetNodeId, type, label);
  }
}

function traceImpact(
  graph: TraceabilityGraph,
  nodeIdOrAlias: string,
  direction: "upstream" | "downstream",
  options: TraceabilityImpactOptions,
): TraceabilityImpact {
  const indexes = graphIndexes(graph);
  const originNodeId = graph.nodeAliases[nodeIdOrAlias] ?? nodeIdOrAlias;
  const origin = indexes.nodesById.get(originNodeId);

  if (!origin) {
    throw new Error(`Traceability node not found: ${nodeIdOrAlias}.`);
  }

  const includeKinds = new Set(options.kinds ?? []);
  const visited = new Set([originNodeId]);
  const depthByNodeId: Record<string, number> = { [originNodeId]: 0 };
  const impactedNodes: TraceabilityNode[] = [];
  const impactedLinks: TraceabilityLink[] = [];
  const seenLinkIds = new Set<string>();
  const queue = [{ nodeId: originNodeId, depth: 0 }];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current || reachedMaxDepth(current.depth, options.maxDepth)) {
      continue;
    }

    const links =
      direction === "downstream"
        ? indexes.outgoing.get(current.nodeId)
        : indexes.incoming.get(current.nodeId);

    for (const link of links ?? []) {
      const nextNodeId =
        direction === "downstream" ? link.targetNodeId : link.sourceNodeId;
      if (visited.has(nextNodeId)) {
        continue;
      }

      const nextNode = indexes.nodesById.get(nextNodeId);
      if (!nextNode) {
        continue;
      }

      visited.add(nextNodeId);
      depthByNodeId[nextNodeId] = current.depth + 1;
      queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });

      if (includeKinds.size === 0 || includeKinds.has(nextNode.kind)) {
        impactedNodes.push(nextNode);
      }

      if (!seenLinkIds.has(link.id)) {
        impactedLinks.push(link);
        seenLinkIds.add(link.id);
      }
    }
  }

  return {
    origin,
    nodes: impactedNodes,
    links: impactedLinks,
    depthByNodeId,
  };
}

function coverageGapForNode(
  graph: TraceabilityGraph,
  node: TraceabilityNode,
  expectation: TraceabilityCoverageExpectation,
): TraceabilityCoverageGap[] {
  const impact =
    expectation.direction === "upstream"
      ? getUpstreamImpact(graph, node.id)
      : getDownstreamImpact(graph, node.id);
  const acceptedKinds = new Set(expectation.acceptedKinds);
  const covered = impact.nodes.some((impactNode) =>
    satisfiesCoverageExpectation(impactNode, acceptedKinds, expectation),
  );

  if (covered) {
    return [];
  }

  return [
    {
      expectationId: expectation.id,
      targetNodeId: node.id,
      targetKind: node.kind,
      targetLabel: node.label,
      direction: expectation.direction,
      acceptedKinds: expectation.acceptedKinds,
      detail: `${node.label} is missing ${expectation.description}.`,
    },
  ];
}

function satisfiesCoverageExpectation(
  node: TraceabilityNode,
  acceptedKinds: Set<TraceabilityNodeKind>,
  expectation: TraceabilityCoverageExpectation,
) {
  if (!acceptedKinds.has(node.kind)) {
    return false;
  }

  if (
    node.kind === "artifact" &&
    expectation.acceptedArtifactTypes &&
    (node.artifactType === undefined ||
      !expectation.acceptedArtifactTypes.includes(node.artifactType))
  ) {
    return false;
  }

  return true;
}

function sharesTraceSource(left: WorkshopArtifact, right: WorkshopArtifact) {
  return (
    (left.source.messageId !== undefined &&
      left.source.messageId === right.source.messageId) ||
    (left.source.artifactId !== undefined &&
      left.source.artifactId === right.source.artifactId) ||
    left.source.artifactId === right.id ||
    right.source.artifactId === left.id
  );
}

function graphIndexes(graph: TraceabilityGraph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, TraceabilityLink[]>();
  const incoming = new Map<string, TraceabilityLink[]>();

  for (const link of graph.links) {
    const outgoingLinks = outgoing.get(link.sourceNodeId) ?? [];
    outgoingLinks.push(link);
    outgoing.set(link.sourceNodeId, outgoingLinks);

    const incomingLinks = incoming.get(link.targetNodeId) ?? [];
    incomingLinks.push(link);
    incoming.set(link.targetNodeId, incomingLinks);
  }

  return { nodesById, outgoing, incoming };
}

function resolveSourceRef(
  sourceRef: TraceabilitySourceRef,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
) {
  if (sourceRef.nodeId) {
    return resolveReference(sourceRef.nodeId, nodesById, aliases);
  }

  if (sourceRef.artifactId) {
    return resolveReference(sourceRef.artifactId, nodesById, aliases);
  }

  if (sourceRef.attachmentId) {
    return resolveReference(sourceRef.attachmentId, nodesById, aliases);
  }

  if (sourceRef.messageId) {
    return resolveReference(sourceRef.messageId, nodesById, aliases);
  }

  return undefined;
}

function resolveReference(
  idOrAlias: string,
  nodesById: Map<string, TraceabilityNode>,
  aliases: Map<string, string>,
) {
  if (nodesById.has(idOrAlias)) {
    return idOrAlias;
  }

  return aliases.get(idOrAlias);
}

function registerAlias(
  aliases: Map<string, string>,
  alias: string,
  nodeId: string,
) {
  if (!aliases.has(alias)) {
    aliases.set(alias, nodeId);
  }
}

function matchesCoverageStatus(
  node: TraceabilityNode,
  expectation: TraceabilityCoverageExpectation,
) {
  return (
    !expectation.statuses ||
    (node.status !== undefined && expectation.statuses.includes(node.status))
  );
}

function reachedMaxDepth(depth: number, maxDepth?: number) {
  return maxDepth !== undefined && depth >= maxDepth;
}

function coverageLabel(kind: TraceabilityWorkItemKind) {
  if (kind === "test") {
    return "validated by";
  }

  if (kind === "prototype") {
    return "prototyped by";
  }

  return "covered by";
}

function compactText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 240
    ? `${normalized.slice(0, 237)}...`
    : normalized;
}

type AddTraceabilityLink = (
  sourceNodeId: string,
  targetNodeId: string,
  type: TraceabilityLinkType,
  label: string,
  id?: string,
) => void;
