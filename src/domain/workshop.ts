export type ParticipantType = "human" | "facilitator" | "agent";

export type ParticipantStatus =
  "idle" | "listening" | "thinking" | "commenting" | "concern";

export type AgentPerspective =
  "business" | "ux" | "risk" | "technical" | "quality";

export type ArtifactType =
  | "problem"
  | "goal"
  | "actor"
  | "flow-step"
  | "requirement"
  | "risk"
  | "assumption"
  | "question"
  | "decision";

export type ArtifactStatus = "draft" | "accepted" | "parked" | "rejected";

export type MessageKind =
  | "welcome"
  | "human-input"
  | "facilitator-guidance"
  | "agent-suggestion"
  | "system";

export type VisualizationMode =
  "process" | "journey" | "requirements" | "risks";

export type SourceRef = {
  messageId?: string;
  artifactId?: string;
  participantId: string;
};

export type Participant = {
  id: string;
  type: ParticipantType;
  name: string;
  perspective: string;
  status: ParticipantStatus;
  currentActivity: string;
};

export type WorkshopMessage = {
  id: string;
  participantId: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  relatedArtifactIds: string[];
};

export type WorkshopArtifact = {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  status: ArtifactStatus;
  createdBy: string;
  updatedAt: string;
  source: SourceRef;
  tags: string[];
};

export type ArtifactLink = {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  label: string;
};

export type WorkshopSession = {
  id: string;
  title: string;
  participants: Participant[];
  messages: WorkshopMessage[];
  artifacts: WorkshopArtifact[];
  links: ArtifactLink[];
  selectedArtifactId?: string;
  visualizationMode: VisualizationMode;
  followDiscussion: boolean;
  updatedAt: string;
};

export type WorkshopReportSection = {
  id: string;
  title: string;
  items: {
    artifactId: string;
    title: string;
    content: string;
    source: string;
  }[];
};

export type WorkshopReport = {
  title: string;
  generatedAt: string;
  sections: WorkshopReportSection[];
  unresolved: WorkshopArtifact[];
};

const now = () => new Date().toISOString();

export const participantIds = {
  human: "human-1",
  facilitator: "facilitator",
  business: "agent-business",
  ux: "agent-ux",
  risk: "agent-risk",
  technical: "agent-technical",
  quality: "agent-quality",
} as const;

export const initialParticipants: Participant[] = [
  {
    id: participantIds.human,
    type: "human",
    name: "Workshop owner",
    perspective: "Human context and decisions",
    status: "listening",
    currentActivity: "Describes the system need",
  },
  {
    id: participantIds.facilitator,
    type: "facilitator",
    name: "Facilitator",
    perspective: "Workshop flow and canvas",
    status: "commenting",
    currentActivity: "Welcoming and shaping the canvas",
  },
  {
    id: participantIds.business,
    type: "agent",
    name: "Value lens",
    perspective: "Business and service value",
    status: "idle",
    currentActivity: "Waiting for value signals",
  },
  {
    id: participantIds.ux,
    type: "agent",
    name: "User lens",
    perspective: "Users, UX, and adoption",
    status: "idle",
    currentActivity: "Watching for user journeys",
  },
  {
    id: participantIds.risk,
    type: "agent",
    name: "Risk lens",
    perspective: "Operational, legal, and failure risk",
    status: "idle",
    currentActivity: "Scanning for assumptions",
  },
  {
    id: participantIds.technical,
    type: "agent",
    name: "Technical lens",
    perspective: "Feasibility and integrations",
    status: "idle",
    currentActivity: "Listening for system boundaries",
  },
  {
    id: participantIds.quality,
    type: "agent",
    name: "Quality lens",
    perspective: "Testability and measurable acceptance",
    status: "idle",
    currentActivity: "Waiting for candidate requirements",
  },
];

export function createInitialWorkshopSession(
  createdAt = now(),
): WorkshopSession {
  const welcomeMessage: WorkshopMessage = {
    id: "message-welcome",
    participantId: participantIds.facilitator,
    kind: "welcome",
    createdAt,
    relatedArtifactIds: ["artifact-workshop-goal", "artifact-open-question"],
    body: "Welcome. Describe what digital system or service change you want to explore, and I will build a shared canvas while we talk. I will ask questions when something is unclear and invite specialist perspectives when they help.",
  };

  return {
    id: "workshop-session-v1",
    title: "AI Requirement Workshop",
    participants: initialParticipants,
    messages: [welcomeMessage],
    artifacts: [
      {
        id: "artifact-workshop-goal",
        type: "goal",
        title: "Workshop goal",
        content:
          "Turn an early idea into traceable requirements, risks, assumptions, and next steps.",
        status: "accepted",
        createdBy: participantIds.facilitator,
        updatedAt: createdAt,
        source: {
          messageId: welcomeMessage.id,
          participantId: participantIds.facilitator,
        },
        tags: ["scope"],
      },
      {
        id: "artifact-open-question",
        type: "question",
        title: "Starting question",
        content:
          "What situation, user group, or operational problem should this workshop focus on?",
        status: "draft",
        createdBy: participantIds.facilitator,
        updatedAt: createdAt,
        source: {
          messageId: welcomeMessage.id,
          participantId: participantIds.facilitator,
        },
        tags: ["clarification"],
      },
    ],
    links: [
      {
        id: "link-goal-question",
        sourceArtifactId: "artifact-workshop-goal",
        targetArtifactId: "artifact-open-question",
        label: "needs context",
      },
    ],
    selectedArtifactId: "artifact-workshop-goal",
    visualizationMode: "process",
    followDiscussion: true,
    updatedAt: createdAt,
  };
}

export function submitHumanMessage(
  session: WorkshopSession,
  body: string,
  createdAt = now(),
): WorkshopSession {
  const trimmed = body.trim();
  if (!trimmed) {
    return session;
  }

  const humanMessage: WorkshopMessage = {
    id: createId("message", session.messages.length + 1),
    participantId: participantIds.human,
    kind: "human-input",
    body: trimmed,
    createdAt,
    relatedArtifactIds: [],
  };

  const artifacts = createArtifactsFromHumanInput(
    trimmed,
    humanMessage.id,
    createdAt,
    session,
  );
  const artifactIds = artifacts.map((artifact) => artifact.id);
  humanMessage.relatedArtifactIds = artifactIds;

  const facilitatorMessage: WorkshopMessage = {
    id: createId("message", session.messages.length + 2),
    participantId: participantIds.facilitator,
    kind: "facilitator-guidance",
    createdAt,
    relatedArtifactIds: artifactIds,
    body: buildFacilitatorResponse(trimmed, artifacts),
  };

  const specialistMessages = createSpecialistSuggestions(
    trimmed,
    artifacts,
    createdAt,
    session,
  );
  const specialistArtifacts = specialistMessages.flatMap(
    (suggestion) => suggestion.artifacts,
  );
  const allNewArtifacts = [...artifacts, ...specialistArtifacts];

  const links = createLinksForArtifacts(
    session.artifacts,
    allNewArtifacts,
    session.links.length + 1,
  );
  const selectedArtifactId =
    session.followDiscussion && allNewArtifacts.length > 0
      ? allNewArtifacts[allNewArtifacts.length - 1]?.id
      : session.selectedArtifactId;

  return {
    ...session,
    messages: [
      ...session.messages,
      humanMessage,
      facilitatorMessage,
      ...specialistMessages.map(({ message }) => message),
    ],
    artifacts: [...session.artifacts, ...allNewArtifacts],
    links: [...session.links, ...links],
    selectedArtifactId,
    participants: updateParticipantStatuses(
      session.participants,
      specialistMessages.length > 0,
    ),
    updatedAt: createdAt,
  };
}

export function updateArtifactStatus(
  session: WorkshopSession,
  artifactId: string,
  status: ArtifactStatus,
  updatedAt = now(),
): WorkshopSession {
  return {
    ...session,
    artifacts: session.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? { ...artifact, status, updatedAt }
        : artifact,
    ),
    updatedAt,
  };
}

export function selectArtifact(
  session: WorkshopSession,
  artifactId: string,
): WorkshopSession {
  return {
    ...session,
    selectedArtifactId: artifactId,
  };
}

export function setVisualizationMode(
  session: WorkshopSession,
  visualizationMode: VisualizationMode,
): WorkshopSession {
  return {
    ...session,
    visualizationMode,
  };
}

export function setFollowDiscussion(
  session: WorkshopSession,
  followDiscussion: boolean,
) {
  return {
    ...session,
    followDiscussion,
  };
}

export function generateWorkshopReport(
  session: WorkshopSession,
  generatedAt = now(),
): WorkshopReport {
  const accepted = session.artifacts.filter(
    (artifact) => artifact.status === "accepted",
  );
  const unresolved = session.artifacts.filter(
    (artifact) => artifact.status !== "accepted",
  );

  return {
    title: `${session.title} report`,
    generatedAt,
    sections: [
      buildReportSection("context", "Context and Goals", accepted, [
        "problem",
        "goal",
        "actor",
      ]),
      buildReportSection("requirements", "Requirement Candidates", accepted, [
        "requirement",
      ]),
      buildReportSection("risks", "Risks and Assumptions", accepted, [
        "risk",
        "assumption",
      ]),
      buildReportSection(
        "decisions",
        "Decisions and Open Questions",
        accepted,
        ["decision", "question"],
      ),
    ].filter((section) => section.items.length > 0),
    unresolved,
  };
}

export function renderReportMarkdown(report: WorkshopReport): string {
  const sections = report.sections
    .map((section) => {
      const rows = section.items
        .map(
          (item) =>
            `- **${item.title}**: ${item.content}\\n  Source: ${item.source}`,
        )
        .join("\n");
      return `## ${section.title}\n\n${rows}`;
    })
    .join("\n\n");

  const unresolved = report.unresolved.length
    ? `\n\n## Unresolved Workshop Material\n\n${report.unresolved
        .map(
          (artifact) =>
            `- **${artifact.title}** (${artifact.status}): ${artifact.content}`,
        )
        .join("\n")}`
    : "";

  return `# ${report.title}\n\nGenerated: ${report.generatedAt}\n\n${sections || "No accepted artifacts yet."}${unresolved}\n`;
}

function createArtifactsFromHumanInput(
  body: string,
  messageId: string,
  createdAt: string,
  session: WorkshopSession,
): WorkshopArtifact[] {
  const nextIndex = session.artifacts.length + 1;
  const compact = compactSentence(body);

  const artifacts: WorkshopArtifact[] = [
    {
      id: createId("artifact-problem", nextIndex),
      type: "problem",
      title: inferProblemTitle(body),
      content: compact,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["from-human-input"],
    },
  ];

  if (
    containsAny(body, [
      "user",
      "användare",
      "kund",
      "operatör",
      "handläggare",
      "medborgare",
    ])
  ) {
    artifacts.push({
      id: createId("artifact-actor", nextIndex + artifacts.length),
      type: "actor",
      title: "Potential actor",
      content: extractActorHint(body),
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["actor"],
    });
  }

  if (
    containsAny(body, ["should", "must", "needs", "ska", "måste", "behöver"])
  ) {
    artifacts.push({
      id: createId("artifact-requirement", nextIndex + artifacts.length),
      type: "requirement",
      title: "Requirement candidate",
      content: `The future solution should support: ${compact}`,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["candidate"],
    });
  }

  if (
    containsAny(body, [
      "flow",
      "process",
      "flöde",
      "steg",
      "handover",
      "överlämning",
    ])
  ) {
    artifacts.push({
      id: createId("artifact-flow-step", nextIndex + artifacts.length),
      type: "flow-step",
      title: "Process step candidate",
      content: `Potential process step to map: ${compact}`,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["process"],
    });
  }

  if (containsAny(body, ["decision", "beslut", "policy", "rule", "regel"])) {
    artifacts.push({
      id: createId("artifact-decision", nextIndex + artifacts.length),
      type: "decision",
      title: "Decision candidate",
      content: `Decision or policy signal to confirm: ${compact}`,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["decision"],
    });
  }

  if (
    containsAny(body, [
      "risk",
      "oro",
      "fel",
      "säkerhet",
      "sekretess",
      "gdpr",
      "kritisk",
    ])
  ) {
    artifacts.push({
      id: createId("artifact-risk", nextIndex + artifacts.length),
      type: "risk",
      title: "Risk to examine",
      content: `Potential risk signaled by the workshop owner: ${compact}`,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["risk"],
    });
  }

  return artifacts;
}

function createSpecialistSuggestions(
  body: string,
  sourceArtifacts: WorkshopArtifact[],
  createdAt: string,
  session: WorkshopSession,
): { message: WorkshopMessage; artifacts: WorkshopArtifact[] }[] {
  const baseIndex = session.messages.length + 3;
  const artifactBaseIndex =
    session.artifacts.length + sourceArtifacts.length + 1;
  const suggestions: {
    message: WorkshopMessage;
    artifacts: WorkshopArtifact[];
  }[] = [];

  if (sourceArtifacts.some((artifact) => artifact.type === "requirement")) {
    const artifact = suggestionArtifact({
      id: createId("artifact-quality-question", artifactBaseIndex),
      type: "question",
      title: "How will this be verified?",
      content:
        "What observable behavior proves that this requirement is satisfied?",
      participantId: participantIds.quality,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["testability"],
    });
    suggestions.push({
      message: {
        id: createId("message-quality", baseIndex + suggestions.length),
        participantId: participantIds.quality,
        kind: "agent-suggestion",
        body: "I see a requirement candidate. Before it is accepted, define the observable acceptance evidence.",
        createdAt,
        relatedArtifactIds: [artifact.id],
      },
      artifacts: [artifact],
    });
  }

  if (
    containsAny(body, [
      "integration",
      "api",
      "system",
      "data",
      "journal",
      "register",
    ])
  ) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-technical-assumption",
        artifactBaseIndex + suggestions.length,
      ),
      type: "assumption",
      title: "Integration assumption",
      content:
        "The workshop likely depends on one or more existing systems or data sources.",
      participantId: participantIds.technical,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["integration"],
    });
    suggestions.push({
      message: {
        id: createId("message-technical", baseIndex + suggestions.length),
        participantId: participantIds.technical,
        kind: "agent-suggestion",
        body: "I recommend making system boundaries and data ownership explicit before detailed requirements are accepted.",
        createdAt,
        relatedArtifactIds: [artifact.id],
      },
      artifacts: [artifact],
    });
  }

  if (sourceArtifacts.some((artifact) => artifact.type === "risk")) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-risk-question",
        artifactBaseIndex + suggestions.length,
      ),
      type: "question",
      title: "Risk severity question",
      content:
        "What is the worst credible operational consequence if this assumption is wrong?",
      participantId: participantIds.risk,
      sourceArtifactId: sourceArtifacts.find(
        (candidate) => candidate.type === "risk",
      )?.id,
      createdAt,
      tags: ["risk"],
    });
    suggestions.push({
      message: {
        id: createId("message-risk", baseIndex + suggestions.length),
        participantId: participantIds.risk,
        kind: "agent-suggestion",
        body: "This risk needs severity and mitigation before it becomes part of a delivery recommendation.",
        createdAt,
        relatedArtifactIds: [artifact.id],
      },
      artifacts: [artifact],
    });
  }

  if (
    sourceArtifacts.some((artifact) => artifact.type === "actor") ||
    containsAny(body, [
      "journey",
      "ux",
      "user",
      "användare",
      "operatör",
      "handläggare",
    ])
  ) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-ux-question",
        artifactBaseIndex + suggestions.length,
      ),
      type: "question",
      title: "User journey question",
      content:
        "Which moment in the user's workflow should become easier, faster, or safer?",
      participantId: participantIds.ux,
      sourceArtifactId: sourceArtifacts.find(
        (candidate) => candidate.type === "actor",
      )?.id,
      createdAt,
      tags: ["ux"],
    });
    suggestions.push({
      message: {
        id: createId("message-ux", baseIndex + suggestions.length),
        participantId: participantIds.ux,
        kind: "agent-suggestion",
        body: "I recommend naming the user moment and desired behavior change before locking requirements.",
        createdAt,
        relatedArtifactIds: [artifact.id],
      },
      artifacts: [artifact],
    });
  }

  if (
    containsAny(body, ["mål", "effekt", "nytta", "value", "goal", "benefit"])
  ) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-business-goal",
        artifactBaseIndex + suggestions.length,
      ),
      type: "goal",
      title: "Value hypothesis",
      content:
        "The expected benefit should be stated as a measurable change in service outcome.",
      participantId: participantIds.business,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["value"],
    });
    suggestions.push({
      message: {
        id: createId("message-business", baseIndex + suggestions.length),
        participantId: participantIds.business,
        kind: "agent-suggestion",
        body: "I suggest turning the intended value into a measurable outcome before prioritizing requirements.",
        createdAt,
        relatedArtifactIds: [artifact.id],
      },
      artifacts: [artifact],
    });
  }

  return suggestions;
}

function suggestionArtifact(args: {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  participantId: string;
  sourceArtifactId?: string;
  createdAt: string;
  tags: string[];
}): WorkshopArtifact {
  return {
    id: args.id,
    type: args.type,
    title: args.title,
    content: args.content,
    status: "draft",
    createdBy: args.participantId,
    updatedAt: args.createdAt,
    source: {
      artifactId: args.sourceArtifactId,
      participantId: args.participantId,
    },
    tags: args.tags,
  };
}

function buildFacilitatorResponse(body: string, artifacts: WorkshopArtifact[]) {
  const artifactSummary = artifacts
    .map((artifact) => artifact.type.replace("-", " "))
    .join(", ");

  if (body.length < 80) {
    return `I captured this as ${artifactSummary}. I need one more detail: who is affected, and what change would count as a useful outcome?`;
  }

  return `I captured ${artifacts.length} workshop artifact${artifacts.length === 1 ? "" : "s"} on the canvas: ${artifactSummary}. I will keep these as draft until you accept or refine them.`;
}

function createLinksForArtifacts(
  existingArtifacts: WorkshopArtifact[],
  newArtifacts: WorkshopArtifact[],
  startIndex: number,
): ArtifactLink[] {
  const root =
    existingArtifacts.find((artifact) => artifact.type === "goal") ??
    existingArtifacts[0];
  if (!root) {
    return [];
  }

  return newArtifacts.map((artifact, index) => ({
    id: createId("link", startIndex + index),
    sourceArtifactId: root.id,
    targetArtifactId: artifact.id,
    label: artifact.type,
  }));
}

function updateParticipantStatuses(
  participants: Participant[],
  hasSpecialistActivity: boolean,
): Participant[] {
  return participants.map((participant) => {
    if (participant.id === participantIds.facilitator) {
      return {
        ...participant,
        status: "commenting",
        currentActivity: "Updating the workshop canvas",
      };
    }

    if (participant.type === "agent") {
      return {
        ...participant,
        status: hasSpecialistActivity ? "thinking" : "listening",
        currentActivity: hasSpecialistActivity
          ? "Contributed a structured perspective"
          : "Listening for relevant signals",
      };
    }

    return {
      ...participant,
      status: "listening",
      currentActivity: "Reviewing the canvas",
    };
  });
}

function buildReportSection(
  id: string,
  title: string,
  artifacts: WorkshopArtifact[],
  types: ArtifactType[],
): WorkshopReportSection {
  return {
    id,
    title,
    items: artifacts
      .filter((artifact) => types.includes(artifact.type))
      .map((artifact) => ({
        artifactId: artifact.id,
        title: artifact.title,
        content: artifact.content,
        source: artifact.source.messageId
          ? `message:${artifact.source.messageId}`
          : `artifact:${artifact.source.artifactId ?? "unknown"}`,
      })),
  };
}

function inferProblemTitle(body: string) {
  if (containsAny(body, ["flöde", "flow", "process"])) {
    return "Process or flow to understand";
  }
  if (containsAny(body, ["app", "system", "verktyg", "tool"])) {
    return "Digital system need";
  }
  return "Workshop problem statement";
}

function extractActorHint(body: string) {
  const lower = body.toLowerCase();
  if (lower.includes("operatör"))
    return "Operator or control-room role affected by the system.";
  if (lower.includes("handläggare"))
    return "Case handler or service employee affected by the system.";
  if (lower.includes("medborgare"))
    return "Citizen/end user affected by the service.";
  if (lower.includes("user") || lower.includes("användare"))
    return "A named user group should be clarified.";
  return "Actor mentioned by the workshop owner; clarify role, goal, and context.";
}

function compactSentence(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 180
    ? `${normalized.slice(0, 177)}...`
    : normalized;
}

function containsAny(body: string, needles: string[]) {
  const lower = body.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function createId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}
