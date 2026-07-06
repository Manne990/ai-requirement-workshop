export type ParticipantType = "human" | "facilitator" | "agent";

export type ParticipantStatus =
  "idle" | "listening" | "thinking" | "commenting" | "concern";

export type AgentPerspective =
  "business" | "ux" | "risk" | "technical" | "quality";

export type ArtifactType =
  | "source"
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

export type WorkshopLanguage = "en" | "sv";

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
  attachments: import("./attachments").WorkshopAttachment[];
  artifacts: WorkshopArtifact[];
  links: ArtifactLink[];
  prototypes: import("./prototype").Prototype[];
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
  id = createWorkshopId(createdAt),
): WorkshopSession {
  const welcomeMessage: WorkshopMessage = {
    id: "message-welcome",
    participantId: participantIds.facilitator,
    kind: "welcome",
    createdAt,
    relatedArtifactIds: [],
    body: "Welcome. Describe what digital system or service change you want to explore, and I will build a shared canvas while we talk. I will ask questions when something is unclear and invite specialist perspectives when they help.",
  };

  return {
    id,
    title: "AI Requirement Workshop",
    participants: initialParticipants,
    messages: [welcomeMessage],
    attachments: [],
    artifacts: [],
    links: [],
    prototypes: [],
    selectedArtifactId: undefined,
    visualizationMode: "process",
    followDiscussion: true,
    updatedAt: createdAt,
  };
}

function createWorkshopId(createdAt: string) {
  const stableTime = createdAt.replace(/\D/g, "").slice(0, 17);
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `workshop-${stableTime}-${random}`;
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
  const language = detectWorkshopLanguage(trimmed);

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
    language,
  );
  const artifactIds = artifacts.map((artifact) => artifact.id);
  humanMessage.relatedArtifactIds = artifactIds;

  const specialistArtifacts = createSpecialistArtifacts(
    trimmed,
    artifacts,
    createdAt,
    session,
    language,
  );
  const allNewArtifacts = [...artifacts, ...specialistArtifacts];
  const facilitatorQuestion = selectFacilitatorQuestion(
    session,
    trimmed,
    allNewArtifacts,
    language,
  );
  const facilitatorMessage: WorkshopMessage = {
    id: createId("message", session.messages.length + 2),
    participantId: participantIds.facilitator,
    kind: "facilitator-guidance",
    createdAt,
    relatedArtifactIds: [
      ...artifactIds,
      ...specialistArtifacts
        .filter((artifact) => artifact.type === "question")
        .slice(0, 1)
        .map((artifact) => artifact.id),
    ],
    body: buildFacilitatorResponse(
      artifacts,
      specialistArtifacts,
      facilitatorQuestion,
      language,
    ),
  };

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
    messages: [...session.messages, humanMessage, facilitatorMessage],
    artifacts: [...session.artifacts, ...allNewArtifacts],
    links: [...session.links, ...links],
    selectedArtifactId,
    participants: updateParticipantStatuses(
      session.participants,
      specialistArtifacts.length > 0,
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
        "source",
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
  language: WorkshopLanguage,
): WorkshopArtifact[] {
  const nextIndex = session.artifacts.length + 1;
  const compact = compactSentence(body);
  const copy = textFor(language);

  const artifacts: WorkshopArtifact[] = [
    {
      id: createId("artifact-problem", nextIndex),
      type: "problem",
      title: inferProblemTitle(body, language),
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
      "personal",
      "medarbetare",
      "team",
      "roll",
      "staff",
      "employee",
    ])
  ) {
    artifacts.push({
      id: createId("artifact-actor", nextIndex + artifacts.length),
      type: "actor",
      title: copy.potentialActorTitle,
      content: extractActorHint(body, language),
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
      title: copy.requirementCandidateTitle,
      content:
        language === "sv"
          ? `Den framtida lösningen behöver stödja: ${compact}`
          : `The future solution should support: ${compact}`,
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
      title: copy.processStepTitle,
      content:
        language === "sv"
          ? `Möjligt processsteg att kartlägga: ${compact}`
          : `Potential process step to map: ${compact}`,
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
      title: copy.decisionCandidateTitle,
      content:
        language === "sv"
          ? `Besluts- eller policysignal att bekräfta: ${compact}`
          : `Decision or policy signal to confirm: ${compact}`,
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
      title: copy.riskTitle,
      content:
        language === "sv"
          ? `Möjlig risk som workshopägaren signalerar: ${compact}`
          : `Potential risk signaled by the workshop owner: ${compact}`,
      status: "draft",
      createdBy: participantIds.facilitator,
      updatedAt: createdAt,
      source: { messageId, participantId: participantIds.human },
      tags: ["risk"],
    });
  }

  return artifacts;
}

function createSpecialistArtifacts(
  body: string,
  sourceArtifacts: WorkshopArtifact[],
  createdAt: string,
  session: WorkshopSession,
  language: WorkshopLanguage,
): WorkshopArtifact[] {
  const artifactBaseIndex =
    session.artifacts.length + sourceArtifacts.length + 1;
  const artifacts: WorkshopArtifact[] = [];
  const copy = textFor(language);

  if (sourceArtifacts.some((artifact) => artifact.type === "requirement")) {
    const artifact = suggestionArtifact({
      id: createId("artifact-quality-question", artifactBaseIndex),
      type: "question",
      title: copy.verificationQuestionTitle,
      content: copy.verificationQuestion,
      participantId: participantIds.quality,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["testability"],
    });
    artifacts.push(artifact);
  }

  if (
    containsAny(body, [
      "integration",
      "api",
      "system",
      "data",
      "journal",
      "register",
      "sql",
      "4g",
      "sensor",
      "kamera",
      "dashboard",
    ])
  ) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-technical-assumption",
        artifactBaseIndex + artifacts.length,
      ),
      type: "assumption",
      title: copy.integrationAssumptionTitle,
      content: copy.integrationAssumption,
      participantId: participantIds.technical,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["integration"],
    });
    artifacts.push(artifact);
  }

  if (sourceArtifacts.some((artifact) => artifact.type === "risk")) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-risk-question",
        artifactBaseIndex + artifacts.length,
      ),
      type: "question",
      title: copy.riskQuestionTitle,
      content: copy.riskQuestion,
      participantId: participantIds.risk,
      sourceArtifactId: sourceArtifacts.find(
        (candidate) => candidate.type === "risk",
      )?.id,
      createdAt,
      tags: ["risk"],
    });
    artifacts.push(artifact);
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
        artifactBaseIndex + artifacts.length,
      ),
      type: "question",
      title: copy.userJourneyQuestionTitle,
      content: copy.userJourneyQuestion,
      participantId: participantIds.ux,
      sourceArtifactId: sourceArtifacts.find(
        (candidate) => candidate.type === "actor",
      )?.id,
      createdAt,
      tags: ["ux"],
    });
    artifacts.push(artifact);
  }

  if (
    containsAny(body, [
      "mål",
      "effekt",
      "nytta",
      "value",
      "goal",
      "benefit",
      "kund",
      "customer",
      "översikt",
    ])
  ) {
    const artifact = suggestionArtifact({
      id: createId(
        "artifact-business-goal",
        artifactBaseIndex + artifacts.length,
      ),
      type: "goal",
      title: copy.valueHypothesisTitle,
      content: copy.valueHypothesis,
      participantId: participantIds.business,
      sourceArtifactId: sourceArtifacts[0]?.id,
      createdAt,
      tags: ["value"],
    });
    artifacts.push(artifact);
  }

  return artifacts;
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

function buildFacilitatorResponse(
  artifacts: WorkshopArtifact[],
  specialistArtifacts: WorkshopArtifact[],
  question: string,
  language: WorkshopLanguage,
) {
  const artifactSummary = artifacts
    .map((artifact) => artifactTypeLabel(artifact.type, language))
    .join(", ");
  const specialistCount = specialistArtifacts.length;

  if (language === "sv") {
    const specialistSummary =
      specialistCount > 0
        ? ` Specialistperspektiven har lagt ${specialistCount} underlag i bakgrunden.`
        : "";
    return `Jag har fångat detta på canvasen som ${artifactSummary}.${specialistSummary} Nästa fråga: ${question}`;
  }

  const specialistSummary =
    specialistCount > 0
      ? ` The specialist perspectives added ${specialistCount} supporting item${specialistCount === 1 ? "" : "s"} in the background.`
      : "";
  return `I captured this on the canvas as ${artifactSummary}.${specialistSummary} Next question: ${question}`;
}

function artifactTypeLabel(type: ArtifactType, language: WorkshopLanguage) {
  const labels: Record<WorkshopLanguage, Record<ArtifactType, string>> = {
    en: {
      source: "source",
      problem: "problem",
      goal: "goal",
      actor: "actor",
      "flow-step": "flow step",
      requirement: "requirement",
      risk: "risk",
      assumption: "assumption",
      question: "question",
      decision: "decision",
    },
    sv: {
      source: "källa",
      problem: "problem",
      goal: "mål",
      actor: "aktör",
      "flow-step": "processteg",
      requirement: "krav",
      risk: "risk",
      assumption: "antagande",
      question: "fråga",
      decision: "beslut",
    },
  };

  return labels[language][type];
}

function selectFacilitatorQuestion(
  session: WorkshopSession,
  body: string,
  artifacts: WorkshopArtifact[],
  language: WorkshopLanguage,
) {
  const dashboardQuestionOrder: FacilitatorQuestionKey[] = [
    "dashboard-users",
    "dashboard-signals",
    "customer-detail",
    "data-freshness",
    "verification",
  ];

  if (
    containsAny(conversationText(session, body), [
      "dashboard",
      "översikt",
      "kund",
      "customer",
      "larm",
      "alarm",
      "sensor",
      "övervakning",
      "monitoring",
    ])
  ) {
    return nextUnaskedQuestion(session, dashboardQuestionOrder, language);
  }

  const question = artifacts.find((artifact) => artifact.type === "question");
  if (question && !hasQuestionBeenAsked(session, question.content)) {
    return question.content;
  }

  return nextUnaskedQuestion(
    session,
    ["affected-decision", "verification"],
    language,
  );
}

type FacilitatorQuestionKey =
  | "dashboard-users"
  | "dashboard-signals"
  | "customer-detail"
  | "data-freshness"
  | "verification"
  | "affected-decision";

function nextUnaskedQuestion(
  session: WorkshopSession,
  keys: FacilitatorQuestionKey[],
  language: WorkshopLanguage,
) {
  const questions = facilitatorQuestions(language);
  const nextKey =
    keys.find((key) => !hasQuestionBeenAsked(session, questions[key])) ??
    keys[keys.length - 1];

  return questions[nextKey];
}

function hasQuestionBeenAsked(session: WorkshopSession, question: string) {
  return session.messages.some(
    (message) =>
      message.participantId === participantIds.facilitator &&
      message.body.includes(question),
  );
}

function conversationText(session: WorkshopSession, latestBody: string) {
  return `${session.messages.map((message) => message.body).join(" ")} ${session.artifacts
    .map((artifact) => `${artifact.title} ${artifact.content}`)
    .join(" ")} ${latestBody}`;
}

function facilitatorQuestions(language: WorkshopLanguage) {
  if (language === "sv") {
    return {
      "dashboard-users":
        "Vilka användare ska dashboarden främst hjälpa först: SOS Alarms interna övervakning, kunden själv, eller båda med olika vyer?",
      "dashboard-signals":
        "Vilka larmstatusar eller avvikelser måste synas direkt i översikten för att personalen ska kunna agera?",
      "customer-detail":
        "När användaren går in på en enskild kund, vilka detaljer behöver de se som inte ska visas i totalöversikten?",
      "data-freshness":
        "Hur färsk måste datan vara för att dashboarden ska vara operativt användbar?",
      verification:
        "Vilket observerbart beteende visar att dashboarden faktiskt löser problemet?",
      "affected-decision":
        "Vem påverkas mest av detta, och vilket konkret beslut ska systemet hjälpa dem att fatta?",
    } satisfies Record<FacilitatorQuestionKey, string>;
  }

  return {
    "dashboard-users":
      "Which users should the dashboard help first: internal monitoring, the customer, or both with different views?",
    "dashboard-signals":
      "Which alarm states or exceptions must be visible immediately in the overview so staff can act?",
    "customer-detail":
      "When the user opens one customer, which details do they need that should not appear in the total overview?",
    "data-freshness":
      "How fresh does the data need to be for the dashboard to be operationally useful?",
    verification:
      "What observable behavior proves that the dashboard actually solves the problem?",
    "affected-decision":
      "Who is most affected by this, and what concrete decision should the system help them make?",
  } satisfies Record<FacilitatorQuestionKey, string>;
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

export function detectWorkshopLanguage(body: string): WorkshopLanguage {
  const lower = body.toLowerCase();
  if (/[åäö]/i.test(body)) {
    return "sv";
  }
  if (
    containsAny(lower, [
      "och",
      "att",
      "som",
      "behöver",
      "ska",
      "måste",
      "kund",
      "larm",
      "övervaka",
      "enskild",
      "översikt",
      "brandlarm",
      "rörelsesensor",
      "dörr",
      "fönster",
    ])
  ) {
    return "sv";
  }
  return "en";
}

function textFor(language: WorkshopLanguage) {
  if (language === "sv") {
    return {
      potentialActorTitle: "Möjlig aktör",
      requirementCandidateTitle: "Kravkandidat",
      processStepTitle: "Processkandidat",
      decisionCandidateTitle: "Beslutskandidat",
      riskTitle: "Risk att undersöka",
      verificationQuestionTitle: "Hur verifierar vi detta?",
      verificationQuestion:
        "Vilket observerbart beteende visar att kravet faktiskt är uppfyllt?",
      integrationAssumptionTitle: "Integrationsantagande",
      integrationAssumption:
        "Workshopen verkar bero på ett eller flera befintliga system, datakällor eller ägarskap runt data.",
      riskQuestionTitle: "Fråga om risknivå",
      riskQuestion:
        "Vilken är den värsta trovärdiga operativa konsekvensen om antagandet är fel?",
      userJourneyQuestionTitle: "Fråga om användarresa",
      userJourneyQuestion:
        "Vilket ögonblick i användarens arbetsflöde ska bli enklare, snabbare eller säkrare?",
      valueHypothesisTitle: "Nyttohypotes",
      valueHypothesis:
        "Den förväntade nyttan bör beskrivas som en mätbar förändring i tjänstens resultat.",
    };
  }

  return {
    potentialActorTitle: "Potential actor",
    requirementCandidateTitle: "Requirement candidate",
    processStepTitle: "Process step candidate",
    decisionCandidateTitle: "Decision candidate",
    riskTitle: "Risk to examine",
    verificationQuestionTitle: "How will this be verified?",
    verificationQuestion:
      "What observable behavior proves that this requirement is satisfied?",
    integrationAssumptionTitle: "Integration assumption",
    integrationAssumption:
      "The workshop likely depends on one or more existing systems, data sources, or data ownership boundaries.",
    riskQuestionTitle: "Risk severity question",
    riskQuestion:
      "What is the worst credible operational consequence if this assumption is wrong?",
    userJourneyQuestionTitle: "User journey question",
    userJourneyQuestion:
      "Which moment in the user's workflow should become easier, faster, or safer?",
    valueHypothesisTitle: "Value hypothesis",
    valueHypothesis:
      "The expected benefit should be stated as a measurable change in service outcome.",
  };
}

function inferProblemTitle(body: string, language: WorkshopLanguage) {
  if (containsAny(body, ["flöde", "flow", "process"])) {
    return language === "sv"
      ? "Process eller flöde att förstå"
      : "Process or flow to understand";
  }
  if (containsAny(body, ["app", "system", "verktyg", "tool"])) {
    return language === "sv"
      ? "Behov av digitalt system"
      : "Digital system need";
  }
  return language === "sv"
    ? "Problemformulering för workshopen"
    : "Workshop problem statement";
}

function extractActorHint(body: string, language: WorkshopLanguage) {
  const lower = body.toLowerCase();
  if (lower.includes("operatör"))
    return language === "sv"
      ? "Operatör eller övervakande roll som påverkas av systemet."
      : "Operator or control-room role affected by the system.";
  if (lower.includes("handläggare"))
    return language === "sv"
      ? "Handläggare eller tjänstemedarbetare som påverkas av systemet."
      : "Case handler or service employee affected by the system.";
  if (lower.includes("medborgare"))
    return language === "sv"
      ? "Medborgare eller slutanvändare som påverkas av tjänsten."
      : "Citizen/end user affected by the service.";
  if (lower.includes("kund"))
    return language === "sv"
      ? "Kund eller kundansvarig roll behöver förtydligas."
      : "Customer or customer-facing role should be clarified.";
  if (
    lower.includes("personal") ||
    lower.includes("medarbetare") ||
    lower.includes("staff") ||
    lower.includes("employee")
  )
    return language === "sv"
      ? "Intern personal som påverkas av systemets övervakning och beslut."
      : "Internal staff affected by the monitoring and decisions in the system.";
  if (lower.includes("user") || lower.includes("användare"))
    return language === "sv"
      ? "En namngiven användargrupp behöver förtydligas."
      : "A named user group should be clarified.";
  return language === "sv"
    ? "Aktör nämnd av workshopägaren; förtydliga roll, mål och kontext."
    : "Actor mentioned by the workshop owner; clarify role, goal, and context.";
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
