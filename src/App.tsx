import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Bot,
  Check,
  CircleHelp,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Focus,
  GitBranch,
  Hand,
  Lightbulb,
  MessageSquare,
  Paperclip,
  Pause,
  Plus,
  RefreshCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./App.css";
import { extractAttachmentDrafts } from "./attachments/extractFile";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthGate";
import { AuthShell } from "./auth/AuthShell";
import { CODEX_MODEL } from "./codex/constants";
import {
  fetchCodexStatus,
  requestCodexWorkshopTurn,
  type CodexStatus,
} from "./codex/client";
import { useAuth } from "./auth/useAuth";
import type { AuthOperation } from "./auth/types";
import { PrototypePanel } from "./components/PrototypePanel";
import { RequirementsPanel } from "./components/RequirementsPanel";
import ConsolidationPanel from "./components/ConsolidationPanel";
import {
  OrganizationPanel,
  type OrganizationPanelAccessCheck,
} from "./components/OrganizationPanel";
import {
  appendPendingCodexHumanMessage,
  applyCodexWorkshopTurn,
} from "./domain/codexWorkshop";
import {
  applyCollaborationEvent,
  createCollaborationEvent,
  createCollaborationProjection,
  type CollaborationActor,
  type WorkshopPresenceSession,
} from "./domain/collaboration";
import type { AttachmentDraft } from "./domain/attachments";
import {
  generatePrototypeFromWorkshop,
  recordPrototypeFeedback,
  type PrototypeFeedbackInput,
} from "./domain/prototype";
import {
  applyRuntimeConsolidationSuggestionWithLedger,
  approveRequirementPanelItem,
  baselineRequirementPanelItem,
  parkRuntimeConsolidationSuggestion,
  recordRequirementPanelLedgerAction,
  rejectRequirementPanelItem,
  selectConsolidationPanelArtifacts,
  selectConsolidationPanelSuggestionsFromSession,
  selectRequirementPanelItemsFromSession,
  supersedeRequirementPanelItem,
  type RequirementRuntimeAuditedAction,
  type RequirementRuntimeLedger,
} from "./domain/requirementRuntime";
import {
  createAuthBoundaryTelemetry,
  createConsolidationAppliedTelemetry,
  createConsolidationParkedTelemetry,
  createMessageSentTelemetry,
  createPrototypeGeneratedTelemetry,
  createRequirementApprovedTelemetry,
  createRequirementBaselinedTelemetry,
  createRequirementRejectedTelemetry,
  createRequirementSupersededTelemetry,
  createWorkshopOpenedTelemetry,
  missionControlProductId,
  type MissionControlTelemetryEvent,
  type MissionControlTelemetrySource,
  type MissionControlTelemetrySurface,
  type MissionControlTelemetryTrigger,
} from "./domain/missionControlTelemetry";
import type { RequirementPanelItem } from "./domain/requirements";
import type { AuthUser } from "./auth/types";
import type {
  OrganizationPermission,
  OrganizationState,
} from "./domain/organization";
import {
  evaluateWorkshopReadiness,
  type WorkshopReadiness,
} from "./domain/readiness";
import {
  createInitialWorkshopSession,
  generateWorkshopReport,
  renderReportMarkdown,
  selectArtifact,
  setFollowDiscussion,
  setVisualizationMode,
  participantIds,
  updateArtifactStatus,
  type ArtifactStatus,
  type ArtifactType,
  type Participant,
  type VisualizationMode,
  type WorkshopArtifact,
  type WorkshopReport,
  type WorkshopSession,
} from "./domain/workshop";
import {
  layoutArtifactPositions,
  routeArtifactEdge,
} from "./domain/artifactLayout";
import {
  createWorkshopRecordExport,
  createWorkshopRecord,
  parseWorkshopRecordExport,
  toWorkshopSummary,
  type SeenInsightIdsByParticipant,
  type WorkshopRecord,
  type WorkshopSummary,
} from "./persistence/workshopStore";
import { workshopRepository } from "./persistence/workshopRepository";
import {
  organizationRepository,
  type OrganizationMembershipContext,
} from "./persistence/organizationRepository";
import { createBrowserRealtimeWorkshopChannel } from "./persistence/browserRealtimeWorkshopChannel";
import type { RealtimeWorkshopChannel } from "./persistence/realtimeWorkshopChannel";
import {
  mirrorWorkshopRecordToDisk,
  type DiskBackupResult,
} from "./persistence/workshopBackup";
import { createMissionControlTelemetrySink } from "./persistence/missionControlTelemetrySink";

const storageKey = "ai-requirement-workshop:v1-session";
const seenInsightsStorageKey = "ai-requirement-workshop:v1-seen-agent-insights";
const missionControlTelemetrySink = createMissionControlTelemetrySink();

type ArtifactNodeData = {
  artifact: WorkshopArtifact;
  onSelect: (artifactId: string) => void;
  onStatusChange: (artifactId: string, status: ArtifactStatus) => void;
};

type BackupStatus = {
  state: "idle" | "saving" | "saved" | "unavailable" | "failed";
  browserSavedAt?: string;
  diskBackedUpAt?: string;
  message: string;
};

type OrganizationRuntime = {
  state: OrganizationState;
  context: OrganizationMembershipContext;
  memberCount: number;
  accessChecks: OrganizationPanelAccessCheck[];
};

const organizationAccessCheckLabels: Record<OrganizationPermission, string> = {
  "view-workshop": "Open workshops",
  "comment-workshop": "Comment",
  "create-workshop": "Create workshops",
  "edit-workshop": "Edit workshops",
  "facilitate-workshop": "Facilitate",
  "invite-members": "Invite members",
  "manage-members": "Manage members",
  "manage-organization": "Manage organization",
};

const visibleOrganizationChecks: OrganizationPermission[] = [
  "view-workshop",
  "create-workshop",
  "edit-workshop",
  "invite-members",
];

const artifactIconMap: Record<ArtifactType, typeof ClipboardList> = {
  source: FileText,
  problem: CircleHelp,
  goal: Lightbulb,
  actor: UserRound,
  "flow-step": GitBranch,
  requirement: ClipboardList,
  risk: ShieldAlert,
  assumption: Eye,
  question: CircleHelp,
  decision: Check,
};

const statusLabel: Record<ArtifactStatus, string> = {
  draft: "Draft",
  accepted: "Accepted",
  parked: "Parked",
  rejected: "Rejected",
};

const visualizationLabels: Record<VisualizationMode, string> = {
  process: "Process",
  journey: "Journey",
  requirements: "Requirements",
  risks: "Risks",
};

function App() {
  return (
    <AuthProvider>
      <MissionControlAuthTelemetryBridge />
      <AuthGate>
        <WorkshopRoom />
      </AuthGate>
    </AuthProvider>
  );
}

function MissionControlAuthTelemetryBridge() {
  const { activeOperation, error, session } = useAuth();
  const previousSessionIdRef = useRef<string | null>(session?.user.id ?? null);
  const lastRequestedOperationRef = useRef<AuthOperation | null>(null);
  const reportedErrorsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!activeOperation) {
      lastRequestedOperationRef.current = null;
      return;
    }

    if (lastRequestedOperationRef.current === activeOperation) {
      return;
    }

    lastRequestedOperationRef.current = activeOperation;
    recordMissionControlTelemetry(
      createAuthBoundaryTelemetry(
        {
          boundary: "remote-api",
          event: "requested",
          provider: "local",
          reason: activeOperation,
        },
        {
          occurredAt: new Date().toISOString(),
          source: createMissionControlTelemetrySource(
            "auth-boundary",
            "user",
            "MissionControlAuthTelemetryBridge",
          ),
        },
      ),
    );
  }, [activeOperation]);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    const currentSessionId = session?.user.id ?? null;

    if (currentSessionId && currentSessionId !== previousSessionId) {
      recordMissionControlTelemetry(
        createAuthBoundaryTelemetry(
          {
            boundary: "remote-api",
            event: "granted",
            provider: "local",
          },
          {
            occurredAt: session?.establishedAt ?? new Date().toISOString(),
            source: createMissionControlTelemetrySource(
              "auth-boundary",
              "system",
              "MissionControlAuthTelemetryBridge",
            ),
            provenance: {
              participantId: currentSessionId,
            },
          },
        ),
      );
    }

    if (previousSessionId && !currentSessionId) {
      recordMissionControlTelemetry(
        createAuthBoundaryTelemetry(
          {
            boundary: "remote-api",
            event: "cleared",
            provider: "local",
          },
          {
            occurredAt: new Date().toISOString(),
            source: createMissionControlTelemetrySource(
              "auth-boundary",
              "user",
              "MissionControlAuthTelemetryBridge",
            ),
            provenance: {
              participantId: previousSessionId,
            },
          },
        ),
      );
    }

    previousSessionIdRef.current = currentSessionId;
  }, [session]);

  useEffect(() => {
    if (!error || reportedErrorsRef.current.has(error)) {
      return;
    }

    reportedErrorsRef.current.add(error);
    recordMissionControlTelemetry(
      createAuthBoundaryTelemetry(
        {
          boundary: "remote-api",
          event: "failed",
          provider: "local",
          reason: error,
        },
        {
          occurredAt: new Date().toISOString(),
          source: createMissionControlTelemetrySource(
            "auth-boundary",
            "system",
            "MissionControlAuthTelemetryBridge",
          ),
        },
      ),
    );
  }, [error]);

  return null;
}

function WorkshopRoom() {
  const { session: authSession } = useAuth();
  const [initialWorkshopState] = useState(() => loadInitialWorkshopState());
  const [session, setSession] = useState<WorkshopSession>(
    initialWorkshopState.session,
  );
  const [requirementLedger, setRequirementLedger] =
    useState<RequirementRuntimeLedger>({
      requirements: initialWorkshopState.requirements,
      auditEvents: initialWorkshopState.auditEvents,
    });
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    AttachmentDraft[]
  >([]);
  const [isExtractingAttachments, setIsExtractingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isCodexThinking, setIsCodexThinking] = useState(false);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>({
    configured: false,
    model: CODEX_MODEL,
    message: "Checking local Codex configuration.",
  });
  const [report, setReport] = useState<WorkshopReport>(() =>
    generateWorkshopReport(initialWorkshopState.session),
  );
  const [workshopSummaries, setWorkshopSummaries] = useState<WorkshopSummary[]>(
    [],
  );
  const [activeWorkshopId, setActiveWorkshopIdState] = useState(session.id);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const [organizationRuntime, setOrganizationRuntime] =
    useState<OrganizationRuntime | null>(null);
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );
  const [presenceSessions, setPresenceSessions] = useState<
    WorkshopPresenceSession[]
  >([]);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedInsightParticipantId, setSelectedInsightParticipantId] =
    useState<string | null>(null);
  const [seenInsightIdsByParticipant, setSeenInsightIdsByParticipant] =
    useState<SeenInsightIdsByParticipant>(
      initialWorkshopState.seenInsightIdsByParticipant,
    );
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({
    state: "idle",
    message: "Workshop has not been saved yet.",
  });
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const saveSequenceRef = useRef(0);
  const openedWorkshopIdRef = useRef<string | null>(null);
  const workshopOpenTriggerRef =
    useRef<MissionControlTelemetryTrigger>("restore");
  const telemetryCorrelationIdRef = useRef(
    `workshop-runtime-${Date.now().toString(36)}`,
  );
  const realtimeChannelRef = useRef<RealtimeWorkshopChannel | null>(null);
  const realtimeSequenceRef = useRef(0);
  const isApplyingRemoteEventRef = useRef(false);
  const clientIdRef = useRef(stableClientId());
  const connectedAtRef = useRef(new Date().toISOString());
  const clientSessionIdRef = useRef(
    `browser-session-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
  );

  const createTelemetryOptions = useCallback(
    (
      surface: MissionControlTelemetrySurface,
      trigger: MissionControlTelemetryTrigger,
      component: string,
      occurredAt = new Date().toISOString(),
    ) => ({
      occurredAt,
      source: createMissionControlTelemetrySource(surface, trigger, component),
      correlationId: telemetryCorrelationIdRef.current,
      recordId: activeWorkshopId,
    }),
    [activeWorkshopId],
  );

  const publishRealtimeSessionDelta = useCallback(
    async (previous: WorkshopSession, next: WorkshopSession) => {
      const channel = realtimeChannelRef.current;
      if (!channel || isApplyingRemoteEventRef.current || !authSession?.user) {
        return;
      }

      const previousMessageIds = new Set(
        previous.messages.map((message) => message.id),
      );
      const previousArtifactIds = new Set(
        previous.artifacts.map((artifact) => artifact.id),
      );

      for (const message of next.messages.filter(
        (candidate) => !previousMessageIds.has(candidate.id),
      )) {
        await channel.publishEvent(
          createCollaborationEvent({
            type: "message.added",
            workshopId: next.id,
            clientId: clientIdRef.current,
            clientSessionId: clientSessionIdRef.current,
            sequence: nextRealtimeSequence(realtimeSequenceRef),
            occurredAt: message.createdAt,
            actor: actorForParticipant(
              next.participants,
              message.participantId,
              authSession.user,
            ),
            payload: { message },
          }),
        );
      }

      for (const artifact of next.artifacts.filter(
        (candidate) => !previousArtifactIds.has(candidate.id),
      )) {
        await channel.publishEvent(
          createCollaborationEvent({
            type: "artifact.added",
            workshopId: next.id,
            clientId: clientIdRef.current,
            clientSessionId: clientSessionIdRef.current,
            sequence: nextRealtimeSequence(realtimeSequenceRef),
            occurredAt: artifact.updatedAt,
            actor: actorForParticipant(
              next.participants,
              artifact.createdBy,
              authSession.user,
            ),
            payload: { artifact, revision: 0 },
          }),
        );
      }
    },
    [authSession?.user],
  );

  const publishRealtimeArtifactStatusChange = useCallback(
    async (
      previousArtifact: WorkshopArtifact,
      nextArtifact: WorkshopArtifact,
    ) => {
      const channel = realtimeChannelRef.current;
      if (!channel || isApplyingRemoteEventRef.current || !authSession?.user) {
        return;
      }

      await channel.publishEvent(
        createCollaborationEvent({
          type: "artifact.statusChanged",
          workshopId: session.id,
          clientId: clientIdRef.current,
          clientSessionId: clientSessionIdRef.current,
          sequence: nextRealtimeSequence(realtimeSequenceRef),
          occurredAt: nextArtifact.updatedAt,
          actor: actorForParticipant(
            session.participants,
            nextArtifact.createdBy,
            authSession.user,
          ),
          payload: {
            artifactId: nextArtifact.id,
            status: nextArtifact.status,
            expectedRevision:
              previousArtifact.status === nextArtifact.status ? 1 : 0,
            updatedAt: nextArtifact.updatedAt,
          },
        }),
      );
    },
    [authSession?.user, session.id, session.participants],
  );

  useEffect(() => {
    let isMounted = true;
    fetchCodexStatus()
      .then((status) => {
        if (isMounted) {
          setCodexStatus(status);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCodexStatus({
            configured: false,
            model: CODEX_MODEL,
            message: "Codex status endpoint is not available.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!authSession?.user) {
      setOrganizationRuntime(null);
      setOrganizationError(null);
      setIsStoreReady(false);
      return () => {
        isMounted = false;
      };
    }

    setIsStoreReady(false);
    setOrganizationError(null);
    initializeOrganizationRuntime(authSession.user)
      .then((runtime) => {
        if (isMounted) {
          setOrganizationRuntime(runtime);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setOrganizationRuntime(null);
          setOrganizationError(
            error instanceof Error
              ? error.message
              : "Organization access could not be initialized.",
          );
          setIsStoreReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authSession?.user]);

  useEffect(() => {
    let isMounted = true;

    if (!authSession?.user || !organizationRuntime) {
      return () => {
        isMounted = false;
      };
    }

    setIsStoreReady(false);
    initializeWorkshopStore(
      initialWorkshopState.session,
      initialWorkshopState.seenInsightIdsByParticipant,
      organizationRuntime.context.organization.id,
      authSession.user.id,
    )
      .then(({ record, summaries }) => {
        if (!isMounted) {
          return;
        }
        setSession((current) =>
          isInitialWorkshopSession(current, initialWorkshopState.session)
            ? record.session
            : current,
        );
        setSeenInsightIdsByParticipant((current) =>
          Object.keys(current).length === 0
            ? record.seenInsightIdsByParticipant
            : current,
        );
        setRequirementLedger({
          requirements: record.requirements,
          auditEvents: record.auditEvents,
        });
        setActiveWorkshopIdState((current) =>
          current === initialWorkshopState.session.id ? record.id : current,
        );
        setWorkshopSummaries(summaries);
        setIsStoreReady(true);
      })
      .catch((error) => {
        if (isMounted) {
          setOrganizationError(
            error instanceof Error
              ? error.message
              : "Workshop access could not be initialized.",
          );
          setIsStoreReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authSession?.user, initialWorkshopState, organizationRuntime]);

  useEffect(() => {
    if (
      !authSession?.user ||
      !isStoreReady ||
      typeof BroadcastChannel === "undefined"
    ) {
      return;
    }

    const channel = createBrowserRealtimeWorkshopChannel({
      workshopId: session.id,
      clientId: clientIdRef.current,
      clientSessionId: clientSessionIdRef.current,
    });
    realtimeChannelRef.current = channel;

    const unsubscribeEvents = channel.subscribeToEvents((event) => {
      if (event.clientSessionId === clientSessionIdRef.current) {
        return;
      }

      isApplyingRemoteEventRef.current = true;
      setSession((current) => {
        const projection = applyCollaborationEvent(
          createCollaborationProjection(current),
          event,
        );
        return projection.session;
      });
      isApplyingRemoteEventRef.current = false;
    });
    const unsubscribePresence =
      channel.subscribeToPresence(setPresenceSessions);

    const track = () =>
      channel.trackPresence({
        workshopId: session.id,
        sessionId: clientSessionIdRef.current,
        clientId: clientIdRef.current,
        participantId: participantIds.human,
        userId: authSession.user.id,
        displayName: authSession.user.displayName,
        status: "active",
        connectedAt: connectedAtRef.current,
        lastSeenAt: new Date().toISOString(),
      });
    void track();
    const heartbeat = window.setInterval(() => void track(), 15_000);

    return () => {
      window.clearInterval(heartbeat);
      unsubscribeEvents();
      unsubscribePresence();
      void channel.close();
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      setPresenceSessions([]);
    };
  }, [authSession?.user, isStoreReady, session.id]);

  useEffect(() => {
    if (!isStoreReady || !organizationRuntime) {
      return;
    }

    if (openedWorkshopIdRef.current !== session.id) {
      openedWorkshopIdRef.current = session.id;
      recordMissionControlTelemetry(
        createWorkshopOpenedTelemetry(
          session,
          createTelemetryOptions(
            "workshop-room",
            workshopOpenTriggerRef.current,
            "WorkshopRoom",
          ),
        ),
      );
      workshopOpenTriggerRef.current = "restore";
    }

    const record = createWorkshopRecord(session, seenInsightIdsByParticipant, {
      organizationId: organizationRuntime.context.organization.id,
      requirements: requirementLedger.requirements,
      auditEvents: requirementLedger.auditEvents,
    });
    workshopRepository.setActiveWorkshopId(record.id);
    setActiveWorkshopIdState(record.id);
    const saveSequence = ++saveSequenceRef.current;
    setBackupStatus((current) => ({
      ...current,
      state: "saving",
      message: "Saving workshop...",
    }));

    void workshopRepository
      .saveRecord(record)
      .then(async () => {
        const browserSavedAt = new Date().toISOString();
        const summaries = filterOrganizationSummaries(
          await workshopRepository.listSummaries(),
          organizationRuntime.context.organization.id,
        );
        if (saveSequence === saveSequenceRef.current) {
          setWorkshopSummaries(summaries);
          setBackupStatus({
            state: "saving",
            browserSavedAt,
            message: "Saved in browser. Backing up to disk...",
          });
        }

        const diskBackup = await mirrorWorkshopRecordToDisk(record);
        if (saveSequence === saveSequenceRef.current) {
          setBackupStatus(toBackupStatus(browserSavedAt, diskBackup));
        }
      })
      .catch(() => {
        if (saveSequence === saveSequenceRef.current) {
          setBackupStatus({
            state: "failed",
            message: "Workshop save failed.",
          });
        }
      });
  }, [
    createTelemetryOptions,
    isStoreReady,
    organizationRuntime,
    requirementLedger.auditEvents,
    requirementLedger.requirements,
    seenInsightIdsByParticipant,
    session,
  ]);

  useEffect(() => {
    setReport(generateWorkshopReport(session));
  }, [session]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }
    messageList.scrollTop = messageList.scrollHeight;
  }, [session.messages.length]);

  const selectedArtifact = useMemo(
    () =>
      session.artifacts.find(
        (artifact) => artifact.id === session.selectedArtifactId,
      ),
    [session.artifacts, session.selectedArtifactId],
  );

  const readiness = useMemo(
    () => evaluateWorkshopReadiness(session),
    [session],
  );

  const requirementPanelItems = useMemo(
    () => selectRequirementPanelItemsFromSession(session),
    [session],
  );

  const consolidationArtifacts = useMemo(
    () => selectConsolidationPanelArtifacts(session),
    [session],
  );

  const consolidationSuggestions = useMemo(
    () => selectConsolidationPanelSuggestionsFromSession(session),
    [session],
  );

  const selectedInsightParticipant = useMemo(
    () =>
      session.participants.find(
        (participant) => participant.id === selectedInsightParticipantId,
      ),
    [selectedInsightParticipantId, session.participants],
  );

  const selectedInsightArtifacts = useMemo(
    () =>
      selectedInsightParticipant
        ? insightsForParticipant(
            session.artifacts,
            selectedInsightParticipant.id,
          )
        : [],
    [selectedInsightParticipant, session.artifacts],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (
      (!message && pendingAttachments.length === 0) ||
      isCodexThinking ||
      isExtractingAttachments
    ) {
      return;
    }

    const attachmentsForTurn = pendingAttachments;
    const submittedAt = new Date().toISOString();
    setDraft("");
    setPendingAttachments([]);
    setCodexError(null);
    const sessionWithPendingMessage = appendPendingCodexHumanMessage(
      session,
      message,
      attachmentsForTurn,
      submittedAt,
    );
    const submittedMessage = findNewHumanMessage(
      session,
      sessionWithPendingMessage,
      submittedAt,
    );
    setSession(sessionWithPendingMessage);
    void publishRealtimeSessionDelta(session, sessionWithPendingMessage);
    if (submittedMessage) {
      recordMissionControlTelemetry(
        createMessageSentTelemetry(
          sessionWithPendingMessage,
          submittedMessage,
          createTelemetryOptions("chat", "user", "WorkshopRoom.handleSubmit"),
        ),
      );
    }
    setIsCodexThinking(true);

    try {
      const turn = await requestCodexWorkshopTurn(
        session,
        message,
        attachmentsForTurn,
      );
      setSession((current) => {
        const next = applyCodexWorkshopTurn(
          current,
          message,
          turn,
          attachmentsForTurn,
          submittedAt,
        );
        void publishRealtimeSessionDelta(current, next);
        return next;
      });
    } catch (error) {
      setDraft(message);
      setPendingAttachments(attachmentsForTurn);
      setCodexError(
        error instanceof Error ? error.message : "Codex request failed.",
      );
    } finally {
      setIsCodexThinking(false);
    }
  };

  const handleSelectArtifact = useCallback((artifactId: string) => {
    setSession((current) => selectArtifact(current, artifactId));
  }, []);

  const handleReset = useCallback(() => {
    setSession((current) =>
      createInitialWorkshopSession(new Date().toISOString(), current.id),
    );
    setSelectedInsightParticipantId(null);
    setSeenInsightIdsByParticipant({});
    setRequirementLedger({ requirements: [], auditEvents: [] });
  }, []);

  const handleCreateWorkshop = useCallback(() => {
    const next = createInitialWorkshopSession();
    workshopOpenTriggerRef.current = "user";
    setSession(next);
    setPendingAttachments([]);
    setDraft("");
    setSelectedInsightParticipantId(null);
    setSeenInsightIdsByParticipant({});
    setRequirementLedger({ requirements: [], auditEvents: [] });
    setActiveWorkshopIdState(next.id);
    workshopRepository.setActiveWorkshopId(next.id);
  }, []);

  const handleExportWorkshop = useCallback(() => {
    const record = createWorkshopRecord(session, seenInsightIdsByParticipant, {
      organizationId: organizationRuntime?.context.organization.id,
      requirements: requirementLedger.requirements,
      auditEvents: requirementLedger.auditEvents,
    });
    downloadWorkshopRecord(record);
  }, [
    organizationRuntime,
    requirementLedger.auditEvents,
    requirementLedger.requirements,
    seenInsightIdsByParticipant,
    session,
  ]);

  const handleImportWorkshopClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportWorkshopFile = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) {
        return;
      }

      try {
        const organizationId = organizationRuntime?.context.organization.id;
        const parsedRecord = parseWorkshopRecordExport(await file.text());
        if (
          organizationId &&
          parsedRecord.organizationId &&
          parsedRecord.organizationId !== organizationId
        ) {
          throw new Error("Imported workshop belongs to another organization.");
        }

        const record = scopeWorkshopRecord(parsedRecord, organizationId);
        await workshopRepository.saveRecord(record);
        workshopRepository.setActiveWorkshopId(record.id);
        workshopOpenTriggerRef.current = "user";
        setSession(record.session);
        setPendingAttachments([]);
        setDraft("");
        setSeenInsightIdsByParticipant(record.seenInsightIdsByParticipant);
        setRequirementLedger({
          requirements: record.requirements,
          auditEvents: record.auditEvents,
        });
        setSelectedInsightParticipantId(null);
        setActiveWorkshopIdState(record.id);
        setWorkshopSummaries(
          filterOrganizationSummaries(
            await workshopRepository.listSummaries(),
            organizationId,
          ),
        );
        setBackupStatus({
          state: "saved",
          browserSavedAt: new Date().toISOString(),
          message: "Imported workshop and saved it in browser.",
        });
      } catch (error) {
        setBackupStatus({
          state: "failed",
          message:
            error instanceof Error ? error.message : "Workshop import failed.",
        });
      } finally {
        if (importInputRef.current) {
          importInputRef.current.value = "";
        }
      }
    },
    [organizationRuntime],
  );

  const handleOpenWorkshop = useCallback(
    async (workshopId: string) => {
      const organizationId = organizationRuntime?.context.organization.id;
      const record = await workshopRepository.loadRecord(workshopId);
      if (!record) {
        return;
      }

      if (
        organizationId &&
        record.organizationId &&
        record.organizationId !== organizationId
      ) {
        setBackupStatus({
          state: "failed",
          message: "Workshop belongs to another organization.",
        });
        return;
      }

      const scopedRecord = scopeWorkshopRecord(record, organizationId);
      workshopOpenTriggerRef.current = "user";
      setSession(scopedRecord.session);
      setPendingAttachments([]);
      setDraft("");
      setSeenInsightIdsByParticipant(scopedRecord.seenInsightIdsByParticipant);
      setRequirementLedger({
        requirements: scopedRecord.requirements,
        auditEvents: scopedRecord.auditEvents,
      });
      setSelectedInsightParticipantId(null);
      setActiveWorkshopIdState(scopedRecord.id);
      workshopRepository.setActiveWorkshopId(scopedRecord.id);
    },
    [organizationRuntime],
  );

  const handleAttachmentPickerClick = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const handleAttachmentFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setAttachmentError(null);
    setIsExtractingAttachments(true);
    try {
      const drafts = await extractAttachmentDrafts(Array.from(files));
      setPendingAttachments((current) => [...current, ...drafts]);
    } catch (error) {
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "Could not read the selected files.",
      );
    } finally {
      setIsExtractingAttachments(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    }
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setPendingAttachments((current) =>
      current.filter((_, candidateIndex) => candidateIndex !== index),
    );
  }, []);

  const handleOpenParticipantInsights = useCallback(
    (participantId: string) => {
      const participant = session.participants.find(
        (candidate) => candidate.id === participantId,
      );
      if (participant?.type !== "agent") {
        return;
      }

      const insightIds = insightsForParticipant(
        session.artifacts,
        participantId,
      ).map((artifact) => artifact.id);
      setSeenInsightIdsByParticipant((current) => ({
        ...current,
        [participantId]: insightIds,
      }));
      setSelectedInsightParticipantId(participantId);
    },
    [session.artifacts, session.participants],
  );

  const handleStatusChange = useCallback(
    (artifactId: string, status: ArtifactStatus) => {
      setSession((current) => {
        const previousArtifact = current.artifacts.find(
          (artifact) => artifact.id === artifactId,
        );
        const next = updateArtifactStatus(current, artifactId, status);
        const nextArtifact = next.artifacts.find(
          (artifact) => artifact.id === artifactId,
        );

        if (
          previousArtifact?.type === "requirement" &&
          nextArtifact?.type === "requirement" &&
          previousArtifact.status !== nextArtifact.status
        ) {
          emitRequirementStatusTelemetry(
            next,
            nextArtifact,
            previousArtifact.status,
            createTelemetryOptions(
              "canvas",
              "user",
              "WorkshopRoom.handleStatusChange",
            ),
          );
          void publishRealtimeArtifactStatusChange(
            previousArtifact,
            nextArtifact,
          );
        }

        return next;
      });
    },
    [createTelemetryOptions, publishRealtimeArtifactStatusChange],
  );

  const handleApplyConsolidation = useCallback(
    (suggestionId: string) => {
      setSession((current) => {
        const organizationId = organizationRuntime?.context.organization.id;
        const suggestion = selectConsolidationPanelSuggestionsFromSession(
          current,
        ).find((candidate) => candidate.id === suggestionId);

        if (!organizationId) {
          return current;
        }

        try {
          const result = applyRuntimeConsolidationSuggestionWithLedger(
            current,
            requirementLedger,
            suggestionId,
            {
              organizationId,
              workshopId: current.id,
            },
            {
              actorId: participantIds.facilitator,
            },
          );
          const next = result.session;
          setRequirementLedger(result.ledger);
          if (suggestion) {
            const previousArtifactIds = new Set(
              current.artifacts.map((artifact) => artifact.id),
            );
            const outputArtifactIds = next.artifacts
              .filter(
                (artifact) =>
                  !previousArtifactIds.has(artifact.id) &&
                  artifact.type === "requirement",
              )
              .map((artifact) => artifact.id);
            recordMissionControlTelemetry(
              createConsolidationAppliedTelemetry(
                next,
                {
                  consolidationId: suggestion.id,
                  inputArtifactIds: suggestion.sourceArtifactIds,
                  outputArtifactIds,
                  approvedRequirementIds: outputArtifactIds,
                  summaryLength: suggestion.rationale?.length,
                },
                createTelemetryOptions(
                  "canvas",
                  "user",
                  "WorkshopRoom.handleApplyConsolidation",
                ),
              ),
            );
          }
          return next;
        } catch {
          return current;
        }
      });
    },
    [
      createTelemetryOptions,
      organizationRuntime?.context.organization.id,
      requirementLedger,
    ],
  );

  const handleParkConsolidation = useCallback(
    (suggestionId: string) => {
      setSession((current) => {
        const suggestion = selectConsolidationPanelSuggestionsFromSession(
          current,
        ).find((candidate) => candidate.id === suggestionId);

        try {
          const next = parkRuntimeConsolidationSuggestion(
            current,
            suggestionId,
            {
              actorId: participantIds.facilitator,
            },
          );
          if (suggestion) {
            recordMissionControlTelemetry(
              createConsolidationParkedTelemetry(
                next,
                {
                  consolidationId: suggestion.id,
                  inputArtifactIds: suggestion.sourceArtifactIds,
                  outputArtifactIds: [],
                  approvedRequirementIds: [],
                  summaryLength: suggestion.rationale?.length,
                },
                createTelemetryOptions(
                  "canvas",
                  "user",
                  "WorkshopRoom.handleParkConsolidation",
                ),
              ),
            );
          }
          return next;
        } catch {
          return current;
        }
      });
    },
    [createTelemetryOptions],
  );

  const handleGeneratePrototype = useCallback(() => {
    setSession((current) => {
      const generatedAt = new Date().toISOString();
      const next = generatePrototypeFromWorkshop(current, {
        title: `${current.title} prototype`,
        actorId: participantIds.facilitator,
        at: generatedAt,
        sourceModel: {
          provider: "codex",
          model: codexStatus.model,
          promptVersion: "prototype-generation-v1",
          generatedBy: participantIds.facilitator,
        },
      });
      const prototype = next.prototypes.at(-1);
      const version = prototype?.versions.find(
        (candidate) => candidate.version === prototype.currentVersion,
      );

      if (prototype && version) {
        recordMissionControlTelemetry(
          createPrototypeGeneratedTelemetry(
            next,
            {
              prototypeId: version.id,
              format: "html",
              sourceArtifactIds: version.requirementRefs
                .map((requirement) => requirement.sourceArtifactId)
                .filter((artifactId): artifactId is string =>
                  Boolean(artifactId),
                ),
              requirementIds: version.requirementRefs.map(
                (requirement) => requirement.requirementId,
              ),
              targetSurface: "prototype-panel",
            },
            createTelemetryOptions(
              "codex-bridge",
              "codex",
              "WorkshopRoom.handleGeneratePrototype",
              generatedAt,
            ),
          ),
        );
      }

      return next;
    });
  }, [codexStatus.model, createTelemetryOptions]);

  const handlePrototypeFeedback = useCallback(
    (input: PrototypeFeedbackInput) => {
      setSession((current) =>
        recordPrototypeFeedback(current, input, {
          actorId: participantIds.human,
          at: new Date().toISOString(),
        }),
      );
    },
    [],
  );

  const recordRequirementLedgerAction = useCallback(
    (
      next: WorkshopSession,
      requirement: RequirementPanelItem,
      action: RequirementRuntimeAuditedAction,
      at: string,
    ) => {
      const organizationId = organizationRuntime?.context.organization.id;
      if (!organizationId) {
        return;
      }

      setRequirementLedger((current) =>
        recordRequirementPanelLedgerAction(
          next,
          current,
          requirement,
          action,
          {
            organizationId,
            workshopId: next.id,
          },
          {
            actorId: participantIds.human,
            at,
          },
        ),
      );
    },
    [organizationRuntime?.context.organization.id],
  );

  const handleApproveRequirement = useCallback(
    (requirement: RequirementPanelItem) => {
      const changedAt = new Date().toISOString();
      setSession((current) =>
        updateRequirementWithTelemetry(
          current,
          requirement.id,
          (sessionToUpdate) =>
            approveRequirementPanelItem(sessionToUpdate, requirement, {
              actorId: participantIds.human,
              at: changedAt,
            }),
          (next, nextRequirement, previousStatus) => {
            recordRequirementLedgerAction(
              next,
              requirement,
              "approved",
              changedAt,
            );
            return createRequirementApprovedTelemetry(next, nextRequirement, {
              ...createTelemetryOptions(
                "canvas",
                "user",
                "WorkshopRoom.handleApproveRequirement",
              ),
              previousStatus,
            });
          },
        ),
      );
    },
    [createTelemetryOptions, recordRequirementLedgerAction],
  );

  const handleRejectRequirement = useCallback(
    (requirement: RequirementPanelItem) => {
      const changedAt = new Date().toISOString();
      setSession((current) =>
        updateRequirementWithTelemetry(
          current,
          requirement.id,
          (sessionToUpdate) =>
            rejectRequirementPanelItem(sessionToUpdate, requirement, {
              actorId: participantIds.human,
              at: changedAt,
            }),
          (next, nextRequirement, previousStatus) => {
            recordRequirementLedgerAction(
              next,
              requirement,
              "rejected",
              changedAt,
            );
            return createRequirementRejectedTelemetry(next, nextRequirement, {
              ...createTelemetryOptions(
                "canvas",
                "user",
                "WorkshopRoom.handleRejectRequirement",
              ),
              previousStatus,
            });
          },
        ),
      );
    },
    [createTelemetryOptions, recordRequirementLedgerAction],
  );

  const handleSupersedeRequirement = useCallback(
    (requirement: RequirementPanelItem) => {
      const changedAt = new Date().toISOString();
      setSession((current) =>
        updateRequirementWithTelemetry(
          current,
          requirement.id,
          (sessionToUpdate) =>
            supersedeRequirementPanelItem(sessionToUpdate, requirement, {
              actorId: participantIds.human,
              at: changedAt,
              rationale: "Marked as superseded from the requirements panel.",
            }),
          (next, nextRequirement, previousStatus) => {
            recordRequirementLedgerAction(
              next,
              requirement,
              "superseded",
              changedAt,
            );
            return createRequirementSupersededTelemetry(next, nextRequirement, {
              ...createTelemetryOptions(
                "canvas",
                "user",
                "WorkshopRoom.handleSupersedeRequirement",
              ),
              previousStatus,
            });
          },
        ),
      );
    },
    [createTelemetryOptions, recordRequirementLedgerAction],
  );

  const handleBaselineRequirement = useCallback(
    (requirement: RequirementPanelItem) => {
      const changedAt = new Date().toISOString();
      setSession((current) =>
        updateRequirementWithTelemetry(
          current,
          requirement.id,
          (sessionToUpdate) =>
            baselineRequirementPanelItem(sessionToUpdate, requirement, {
              actorId: participantIds.human,
              at: changedAt,
            }),
          (next, nextRequirement, previousStatus) => {
            recordRequirementLedgerAction(
              next,
              requirement,
              "baselined",
              changedAt,
            );
            return createRequirementBaselinedTelemetry(next, nextRequirement, {
              ...createTelemetryOptions(
                "canvas",
                "user",
                "WorkshopRoom.handleBaselineRequirement",
              ),
              previousStatus,
            });
          },
        ),
      );
    },
    [createTelemetryOptions, recordRequirementLedgerAction],
  );

  const artifactPositions = useMemo(
    () => layoutArtifactPositions(session.artifacts, session.visualizationMode),
    [session.artifacts, session.visualizationMode],
  );

  const artifactNodes = useMemo<Node<ArtifactNodeData>[]>(
    () =>
      session.artifacts.map((artifact, index) => ({
        id: artifact.id,
        type: "artifact",
        position: artifactPositions[artifact.id] ?? { x: 0, y: index * 260 },
        data: {
          artifact,
          onSelect: handleSelectArtifact,
          onStatusChange: handleStatusChange,
        },
      })),
    [
      artifactPositions,
      handleSelectArtifact,
      handleStatusChange,
      session.artifacts,
    ],
  );

  const artifactEdges = useMemo<Edge[]>(
    () =>
      session.links.map((link) => {
        const route = routeArtifactEdge(
          artifactPositions[link.sourceArtifactId],
          artifactPositions[link.targetArtifactId],
        );

        return {
          id: link.id,
          source: link.sourceArtifactId,
          target: link.targetArtifactId,
          sourceHandle: route.sourceHandle,
          targetHandle: route.targetHandle,
          type: "smoothstep",
          pathOptions: {
            borderRadius: 24,
            offset: 56,
          },
          label: link.label,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          className: "artifact-edge",
          interactionWidth: 18,
          style: {
            strokeWidth: 2.4,
          },
        };
      }),
    [artifactPositions, session.links],
  );

  const acceptedCount = session.artifacts.filter(
    (artifact) => artifact.status === "accepted",
  ).length;
  const draftCount = session.artifacts.filter(
    (artifact) => artifact.status === "draft",
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Workshop status">
        <div>
          <p className="eyebrow">AI Requirement Workshop</p>
          <h1>Collaborative requirement room</h1>
        </div>
        <div className="topbar-actions">
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            aria-label="Import workshop file"
            accept=".json,application/json"
            onChange={(event) =>
              void handleImportWorkshopFile(event.target.files)
            }
          />
          <div className="workshop-switcher">
            <label htmlFor="workshop-select">Open workshop</label>
            <select
              id="workshop-select"
              value={activeWorkshopId}
              onChange={(event) => void handleOpenWorkshop(event.target.value)}
              disabled={!isStoreReady || workshopSummaries.length === 0}
            >
              {workshopSummaries.length === 0 ? (
                <option value={activeWorkshopId}>Current workshop</option>
              ) : (
                workshopSummaries.map((summary) => (
                  <option value={summary.id} key={summary.id}>
                    {summary.title}
                  </option>
                ))
              )}
            </select>
          </div>
          <div
            className={`codex-status ${codexStatus.configured ? "configured" : "missing"}`}
          >
            <Sparkles aria-hidden="true" size={16} />
            <div>
              <span>Codex {codexStatus.model}</span>
              <small>{codexStatus.message}</small>
            </div>
          </div>
          <BackupStatusPill status={backupStatus} />
          <AuthShell />
          <button
            className="ghost-button"
            type="button"
            onClick={handleExportWorkshop}
          >
            <Download aria-hidden="true" size={18} />
            Export
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleImportWorkshopClick}
          >
            <Upload aria-hidden="true" size={18} />
            Import
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleCreateWorkshop}
          >
            <Plus aria-hidden="true" size={18} />
            New
          </button>
          <button className="ghost-button" type="button" onClick={handleReset}>
            <RefreshCcw aria-hidden="true" size={18} />
            Reset
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setIsReportOpen(true)}
          >
            <FileText aria-hidden="true" size={18} />
            Report
          </button>
        </div>
      </header>

      <section className="workspace-grid" aria-label="Workshop room">
        <section className="canvas-pane" aria-label="Zoomable workshop canvas">
          <div className="canvas-header">
            <div>
              <p className="eyebrow">Live canvas</p>
              <h2>{session.title}</h2>
            </div>
            <div className="canvas-toolbar">
              <div className="mode-control" aria-label="Visualization mode">
                {(Object.keys(visualizationLabels) as VisualizationMode[]).map(
                  (mode) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={session.visualizationMode === mode}
                      className={
                        session.visualizationMode === mode ? "active" : ""
                      }
                      onClick={() =>
                        setSession((current) =>
                          setVisualizationMode(current, mode),
                        )
                      }
                    >
                      {visualizationLabels[mode]}
                    </button>
                  ),
                )}
              </div>
              <div className="canvas-panel" aria-label="Canvas status">
                <span>{acceptedCount} accepted</span>
                <span>{draftCount} draft</span>
                <button
                  type="button"
                  aria-pressed={session.followDiscussion}
                  className={session.followDiscussion ? "active" : ""}
                  onClick={() =>
                    setSession((current) =>
                      setFollowDiscussion(current, !current.followDiscussion),
                    )
                  }
                >
                  <Focus aria-hidden="true" size={14} />
                  Follow
                </button>
              </div>
            </div>
          </div>

          <div className="canvas-surface">
            <ReactFlow
              nodes={artifactNodes}
              edges={artifactEdges}
              nodeTypes={{ artifact: ArtifactNode }}
              fitView
              minZoom={0.35}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} color="rgba(255,255,255,0.08)" />
              <Controls position="bottom-left" />
            </ReactFlow>
          </div>
        </section>

        <section className="operations-pane" aria-label="Workshop operations">
          <OrganizationPanel
            membershipContext={organizationRuntime?.context ?? null}
            memberCount={organizationRuntime?.memberCount ?? 0}
            invites={organizationRuntime?.state.invites ?? []}
            accessChecks={organizationRuntime?.accessChecks ?? []}
          />
          {organizationError ? (
            <p className="composer-error">{organizationError}</p>
          ) : null}
          <PrototypePanel
            session={session}
            modelName={codexStatus.model}
            onGeneratePrototype={handleGeneratePrototype}
            onRecordFeedback={handlePrototypeFeedback}
          />
          <RequirementsPanel
            requirements={requirementPanelItems}
            selectedRequirementId={selectedArtifact?.id}
            onSelectRequirement={(requirement) =>
              handleSelectArtifact(requirement.id)
            }
            onApprove={handleApproveRequirement}
            onReject={handleRejectRequirement}
            onSupersede={handleSupersedeRequirement}
            onBaseline={handleBaselineRequirement}
          />
          <ConsolidationPanel
            suggestions={consolidationSuggestions}
            artifacts={consolidationArtifacts}
            onApplySuggestion={handleApplyConsolidation}
            onParkSuggestion={handleParkConsolidation}
          />
        </section>

        <aside className="chat-pane" aria-label="Workshop chat">
          <div className="chat-header">
            <div>
              <p className="eyebrow">Workshop chat</p>
              <h2>Discussion</h2>
            </div>
            <MessageSquare aria-hidden="true" size={22} />
          </div>

          <div
            className="message-list"
            role="log"
            aria-live="polite"
            ref={messageListRef}
          >
            {session.messages.map((message) => {
              const participant = session.participants.find(
                (candidate) => candidate.id === message.participantId,
              );
              return (
                <article className={`message ${message.kind}`} key={message.id}>
                  <div className="message-meta">
                    <span>{participant?.name ?? message.participantId}</span>
                    <time dateTime={message.createdAt}>
                      {formatTime(message.createdAt)}
                    </time>
                  </div>
                  <p>{message.body}</p>
                  {message.relatedArtifactIds.length > 0 ? (
                    <div className="message-artifacts">
                      {message.relatedArtifactIds.map((artifactId) => (
                        <button
                          type="button"
                          key={artifactId}
                          onClick={() => handleSelectArtifact(artifactId)}
                        >
                          {shortArtifactName(
                            session.artifacts.find(
                              (artifact) => artifact.id === artifactId,
                            ),
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label htmlFor="workshop-input">
              Describe, challenge, or refine the requirement discussion
            </label>
            <input
              ref={attachmentInputRef}
              className="file-input"
              type="file"
              aria-label="Attach workshop files"
              multiple
              accept=".txt,.md,.csv,.json,.log,.docx,.xlsx,.xls,text/plain,text/csv,text/markdown,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) =>
                void handleAttachmentFiles(event.target.files)
              }
            />
            <textarea
              id="workshop-input"
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Example: SOS operators need a way to compare incoming incident data against earlier calls without slowing dispatch..."
              disabled={isCodexThinking}
            />
            <div className="attachment-toolbar">
              <button
                className="ghost-button"
                type="button"
                onClick={handleAttachmentPickerClick}
                disabled={isCodexThinking || isExtractingAttachments}
              >
                <Paperclip aria-hidden="true" size={16} />
                {isExtractingAttachments ? "Reading files" : "Attach files"}
              </button>
              {pendingAttachments.length > 0 ? (
                <span>
                  {pendingAttachments.length} pending attachment
                  {pendingAttachments.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {pendingAttachments.length > 0 ? (
              <div className="pending-attachments" aria-label="Pending files">
                {pendingAttachments.map((attachment, index) => (
                  <article
                    className="pending-attachment"
                    key={`${attachment.name}-${index}`}
                  >
                    <div>
                      <strong>{attachment.name}</strong>
                      <span>
                        {formatFileSize(attachment.size)} ·{" "}
                        {attachment.status === "extracted"
                          ? "text extracted"
                          : "metadata only"}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() => handleRemoveAttachment(index)}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            {attachmentError ? (
              <p className="composer-error">{attachmentError}</p>
            ) : null}
            {codexError ? <p className="composer-error">{codexError}</p> : null}
            <button
              className="primary-button"
              type="submit"
              disabled={
                (!draft.trim() && pendingAttachments.length === 0) ||
                isCodexThinking ||
                isExtractingAttachments
              }
            >
              <Send aria-hidden="true" size={18} />
              {isCodexThinking ? "Codex thinking" : "Send"}
            </button>
          </form>
        </aside>
      </section>

      <section
        className="detail-rail"
        aria-label="Participants and selected artifact"
      >
        <div className="selected-artifact">
          <p className="eyebrow">Selected artifact</p>
          {selectedArtifact ? (
            <>
              <h2>{selectedArtifact.title}</h2>
              <p>{selectedArtifact.content}</p>
              <div className="artifact-actions">
                <button
                  type="button"
                  onClick={() =>
                    handleStatusChange(selectedArtifact.id, "accepted")
                  }
                >
                  <Check aria-hidden="true" size={16} />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleStatusChange(selectedArtifact.id, "parked")
                  }
                >
                  <Pause aria-hidden="true" size={16} />
                  Park
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleStatusChange(selectedArtifact.id, "rejected")
                  }
                >
                  <X aria-hidden="true" size={16} />
                  Reject
                </button>
              </div>
            </>
          ) : (
            <p>Select a canvas artifact to inspect provenance and status.</p>
          )}
        </div>

        <ReadinessCard readiness={readiness} />

        <div className="participants-strip">
          <section
            className="live-collaborators"
            aria-label="Connected collaborators"
          >
            <div className="live-collaborators__heading">
              <Sparkles aria-hidden="true" size={18} />
              <h3>Live collaborators</h3>
            </div>
            <ul>
              {presenceSessions.length === 0 ? (
                <li>Waiting for presence</li>
              ) : (
                presenceSessions.map((presence) => (
                  <li key={presence.sessionId}>
                    <span>{presence.displayName}</span>
                    <small>{presence.status}</small>
                  </li>
                ))
              )}
            </ul>
          </section>
          {session.participants.map((participant) => {
            const insights = insightsForParticipant(
              session.artifacts,
              participant.id,
            );
            const seenIds = new Set(
              seenInsightIdsByParticipant[participant.id] ?? [],
            );
            const unreadInsightCount = insights.filter(
              (artifact) => !seenIds.has(artifact.id),
            ).length;

            return (
              <ParticipantChip
                participant={participant}
                key={participant.id}
                insightCount={insights.length}
                unreadInsightCount={unreadInsightCount}
                isSelected={participant.id === selectedInsightParticipantId}
                onOpenInsights={handleOpenParticipantInsights}
              />
            );
          })}
        </div>
      </section>

      {selectedInsightParticipant ? (
        <AgentInsightsPanel
          participant={selectedInsightParticipant}
          artifacts={selectedInsightArtifacts}
          onClose={() => setSelectedInsightParticipantId(null)}
          onSelectArtifact={handleSelectArtifact}
        />
      ) : null}

      {isReportOpen ? (
        <ReportDrawer
          report={report}
          onClose={() => setIsReportOpen(false)}
          onDownload={() => downloadReport(report)}
        />
      ) : null}
    </main>
  );
}

function BackupStatusPill({ status }: { status: BackupStatus }) {
  const label =
    status.state === "saved"
      ? "Backed up"
      : status.state === "saving"
        ? "Saving"
        : status.state === "unavailable"
          ? "Browser saved"
          : status.state === "failed"
            ? "Backup issue"
            : "Not saved";

  return (
    <div className={`backup-status status-${status.state}`}>
      <Check aria-hidden="true" size={16} />
      <div>
        <span>{label}</span>
        <small>{status.message}</small>
      </div>
    </div>
  );
}

function updateRequirementWithTelemetry(
  current: WorkshopSession,
  requirementId: string,
  update: (session: WorkshopSession) => WorkshopSession,
  createEvent: (
    next: WorkshopSession,
    requirement: WorkshopArtifact,
    previousStatus: ArtifactStatus | undefined,
  ) => MissionControlTelemetryEvent,
) {
  const previousRequirement = current.artifacts.find(
    (artifact) =>
      artifact.id === requirementId && artifact.type === "requirement",
  );

  try {
    const next = update(current);
    const nextRequirement = next.artifacts.find(
      (artifact) =>
        artifact.id === requirementId && artifact.type === "requirement",
    );

    if (nextRequirement) {
      try {
        recordMissionControlTelemetry(
          createEvent(next, nextRequirement, previousRequirement?.status),
        );
      } catch {
        return next;
      }
    }

    return next;
  } catch {
    return current;
  }
}

function emitRequirementStatusTelemetry(
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  previousStatus: ArtifactStatus,
  options: Parameters<typeof createRequirementApprovedTelemetry>[2],
) {
  try {
    if (requirement.status === "accepted") {
      recordMissionControlTelemetry(
        createRequirementApprovedTelemetry(session, requirement, {
          ...options,
          previousStatus,
        }),
      );
      return;
    }

    if (requirement.status === "rejected") {
      recordMissionControlTelemetry(
        createRequirementRejectedTelemetry(session, requirement, {
          ...options,
          previousStatus,
        }),
      );
    }
  } catch {
    return;
  }
}

function findNewHumanMessage(
  previous: WorkshopSession,
  next: WorkshopSession,
  createdAt: string,
) {
  const previousMessageIds = new Set(
    previous.messages.map((message) => message.id),
  );

  return next.messages.find(
    (message) =>
      !previousMessageIds.has(message.id) &&
      message.kind === "human-input" &&
      message.createdAt === createdAt,
  );
}

function recordMissionControlTelemetry(event: MissionControlTelemetryEvent) {
  void missionControlTelemetrySink.record(event).catch(() => undefined);
}

function nextRealtimeSequence(ref: { current: number }) {
  ref.current += 1;
  return ref.current;
}

function actorForParticipant(
  participants: Participant[],
  participantId: string,
  user: AuthUser,
): CollaborationActor {
  const participant = participants.find(
    (candidate) => candidate.id === participantId,
  );

  if (!participant || participant.type === "human") {
    return {
      participantId: participantId || participantIds.human,
      userId: user.id,
      displayName: user.displayName,
      type: "human",
    };
  }

  return {
    participantId,
    displayName: participant.name,
    type: participant.type,
  };
}

function createMissionControlTelemetrySource(
  surface: MissionControlTelemetrySurface,
  trigger: MissionControlTelemetryTrigger,
  component?: string,
): MissionControlTelemetrySource {
  return {
    product: missionControlProductId,
    surface,
    trigger,
    runtime: missionControlRuntime(),
    component,
  };
}

function missionControlRuntime(): MissionControlTelemetrySource["runtime"] {
  if (import.meta.env.MODE === "test") {
    return "test";
  }

  if (import.meta.env.DEV) {
    return "vite";
  }

  return typeof window === "undefined" ? "unknown" : "browser";
}

function ArtifactNode({ data }: NodeProps<Node<ArtifactNodeData>>) {
  const { artifact, onSelect, onStatusChange } = data;
  const Icon = artifactIconMap[artifact.type];

  return (
    <article className={`artifact-node status-${artifact.status}`}>
      <Handle
        id="target-left"
        className="artifact-handle"
        type="target"
        position={Position.Left}
      />
      <Handle
        id="target-right"
        className="artifact-handle"
        type="target"
        position={Position.Right}
      />
      <Handle
        id="target-top"
        className="artifact-handle"
        type="target"
        position={Position.Top}
      />
      <Handle
        id="target-bottom"
        className="artifact-handle"
        type="target"
        position={Position.Bottom}
      />
      <Handle
        id="source-left"
        className="artifact-handle"
        type="source"
        position={Position.Left}
      />
      <Handle
        id="source-right"
        className="artifact-handle"
        type="source"
        position={Position.Right}
      />
      <Handle
        id="source-top"
        className="artifact-handle"
        type="source"
        position={Position.Top}
      />
      <Handle
        id="source-bottom"
        className="artifact-handle"
        type="source"
        position={Position.Bottom}
      />
      <button
        className="node-select-button"
        type="button"
        aria-label={`Inspect ${artifact.title}`}
        onClick={() => onSelect(artifact.id)}
      >
        <div className="node-heading">
          <Icon aria-hidden="true" size={18} />
          <span>{artifact.type.replace("-", " ")}</span>
        </div>
        <h3>{artifact.title}</h3>
        <p>{artifact.content}</p>
      </button>
      <div className="node-footer">
        <span>{statusLabel[artifact.status]}</span>
        <div>
          <button
            aria-label={`Accept ${artifact.title}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStatusChange(artifact.id, "accepted");
            }}
          >
            <Check aria-hidden="true" size={14} />
          </button>
          <button
            aria-label={`Park ${artifact.title}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStatusChange(artifact.id, "parked");
            }}
          >
            <Pause aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function ParticipantChip({
  participant,
  insightCount,
  unreadInsightCount,
  isSelected,
  onOpenInsights,
}: {
  participant: Participant;
  insightCount: number;
  unreadInsightCount: number;
  isSelected: boolean;
  onOpenInsights: (participantId: string) => void;
}) {
  const Icon =
    participant.type === "human"
      ? UserRound
      : participant.type === "facilitator"
        ? Sparkles
        : Bot;
  const isAgent = participant.type === "agent";

  const content = (
    <>
      <Icon aria-hidden="true" size={18} />
      <div>
        <h3>
          {participant.name}
          {unreadInsightCount > 0 ? (
            <span
              className="raised-hand"
              aria-label={`${participant.name} has ${unreadInsightCount} new insights`}
            >
              <Hand aria-hidden="true" size={14} />
            </span>
          ) : null}
        </h3>
        <p>{participant.currentActivity}</p>
        <span>
          {participant.perspective}
          {isAgent
            ? ` · ${insightCount} insight${insightCount === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
    </>
  );

  if (isAgent) {
    return (
      <button
        type="button"
        className={`participant-chip participant-button status-${participant.status}`}
        aria-label={`${participant.name} insights (${insightCount} total, ${unreadInsightCount} new)`}
        aria-pressed={isSelected}
        onClick={() => onOpenInsights(participant.id)}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={`participant-chip status-${participant.status}`}>
      {content}
    </article>
  );
}

function ReadinessCard({ readiness }: { readiness: WorkshopReadiness }) {
  const visibleBlockers = readiness.blockers.slice(0, 3);

  return (
    <article className={`readiness-card readiness-${readiness.level}`}>
      <div className="readiness-heading">
        <div>
          <p className="eyebrow">Readiness</p>
          <h2>{readiness.score}%</h2>
        </div>
        <span>{readiness.level}</span>
      </div>
      <div
        className="readiness-meter"
        aria-label={`Workshop readiness ${readiness.score}%`}
      >
        <span style={{ width: `${readiness.score}%` }} />
      </div>
      <p>{readiness.summary}</p>
      {visibleBlockers.length > 0 ? (
        <ul>
          {visibleBlockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p>Facilitator can recommend moving to report mode.</p>
      )}
    </article>
  );
}

function AgentInsightsPanel({
  participant,
  artifacts,
  onClose,
  onSelectArtifact,
}: {
  participant: Participant;
  artifacts: WorkshopArtifact[];
  onClose: () => void;
  onSelectArtifact: (artifactId: string) => void;
}) {
  return (
    <aside
      className="agent-insights-panel"
      role="dialog"
      aria-label={`${participant.name} insights`}
    >
      <div className="agent-insights-header">
        <div>
          <p className="eyebrow">Agent insights</p>
          <h2>{participant.name}</h2>
          <span>{participant.perspective}</span>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close agent insights"
          onClick={onClose}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      <div className="agent-insights-list">
        {artifacts.length === 0 ? (
          <p className="empty-insights">
            This agent has not added any workshop material yet.
          </p>
        ) : (
          artifacts.map((artifact) => (
            <article
              className={`agent-insight status-${artifact.status}`}
              key={artifact.id}
            >
              <div className="agent-insight-meta">
                <span>{artifact.type.replace("-", " ")}</span>
                <time dateTime={artifact.updatedAt}>
                  {formatTime(artifact.updatedAt)}
                </time>
              </div>
              <h3>{artifact.title}</h3>
              <p>{artifact.content}</p>
              <div className="agent-insight-footer">
                <span>{statusLabel[artifact.status]}</span>
                <button
                  type="button"
                  onClick={() => onSelectArtifact(artifact.id)}
                >
                  Show on canvas
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

function ReportDrawer({
  report,
  onClose,
  onDownload,
}: {
  report: WorkshopReport;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <aside
      className="report-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Workshop report"
    >
      <div className="report-header">
        <div>
          <p className="eyebrow">Generated output</p>
          <h2>{report.title}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close report"
          onClick={onClose}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>
      <div className="report-body">
        {report.sections.length === 0 ? (
          <p>
            No accepted artifacts yet. Accept canvas material to include it in
            the report.
          </p>
        ) : (
          report.sections.map((section) => (
            <section key={section.id}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item.artifactId}>
                    <strong>{item.title}</strong>
                    <span>{item.content}</span>
                    <small>{item.source}</small>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <section>
          <h3>Unresolved</h3>
          <p>
            {report.unresolved.length} draft, parked, or rejected artifacts
            remain visible for follow-up.
          </p>
        </section>
      </div>
      <button className="primary-button" type="button" onClick={onDownload}>
        <Download aria-hidden="true" size={18} />
        Download markdown
      </button>
    </aside>
  );
}

function loadSession() {
  const fallback = createInitialWorkshopSession(
    undefined,
    initialWorkshopIdFromUrl(),
  );
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    return migrateSession(JSON.parse(raw) as Partial<WorkshopSession>);
  } catch {
    return fallback;
  }
}

function initialWorkshopIdFromUrl() {
  try {
    const workshopId = new URLSearchParams(window.location.search)
      .get("workshopId")
      ?.trim();
    return workshopId || undefined;
  } catch {
    return undefined;
  }
}

function stableClientId() {
  const key = "ai-requirement-workshop:v1-realtime-client-id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `browser-client-${crypto.randomUUID()}`
        : `browser-client-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 10)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `browser-client-${Date.now().toString(36)}`;
  }
}

function loadInitialWorkshopState() {
  return {
    session: loadSession(),
    seenInsightIdsByParticipant: loadSeenInsightIdsByParticipant(),
    requirements: [],
    auditEvents: [],
  };
}

function isInitialWorkshopSession(
  current: WorkshopSession,
  initial: WorkshopSession,
) {
  return (
    current.id === initial.id &&
    current.updatedAt === initial.updatedAt &&
    current.messages.length === initial.messages.length &&
    current.artifacts.length === initial.artifacts.length &&
    current.attachments.length === initial.attachments.length
  );
}

async function initializeWorkshopStore(
  fallbackSession: WorkshopSession,
  fallbackSeenInsightIdsByParticipant: SeenInsightIdsByParticipant,
  organizationId: string,
  userId: string,
): Promise<{ record: WorkshopRecord; summaries: WorkshopSummary[] }> {
  const activeWorkshopId = workshopRepository.getActiveWorkshopId();
  const summaries = filterOrganizationSummaries(
    await workshopRepository.listSummaries(),
    organizationId,
  );
  const activeRecord = ensureRecordForOrganization(
    activeWorkshopId
      ? await workshopRepository.loadRecord(activeWorkshopId)
      : null,
    organizationId,
  );
  const latestRecord = summaries[0]
    ? ensureRecordForOrganization(
        await workshopRepository.loadRecord(summaries[0].id),
        organizationId,
      )
    : null;
  const record =
    activeRecord ??
    latestRecord ??
    createWorkshopRecord(fallbackSession, fallbackSeenInsightIdsByParticipant, {
      organizationId,
    });

  await organizationRepository.assertWorkshopAccess(
    userId,
    { id: record.id, organizationId },
    "edit-workshop",
  );
  await workshopRepository.saveRecord(record);
  workshopRepository.setActiveWorkshopId(record.id);

  const nextSummaries = filterOrganizationSummaries(
    await workshopRepository.listSummaries(),
    organizationId,
  );
  return {
    record,
    summaries:
      nextSummaries.length > 0 ? nextSummaries : [toWorkshopSummary(record)],
  };
}

async function initializeOrganizationRuntime(
  user: AuthUser,
): Promise<OrganizationRuntime> {
  let context = await organizationRepository.getActiveOrganizationForUser(
    user.id,
  );

  if (!context) {
    const created = await organizationRepository.createOrganization({
      name: `${user.displayName}'s organization`,
      ownerUserId: user.id,
    });
    const organization = created.organizations.find(
      (candidate) => candidate.createdByUserId === user.id,
    );
    if (!organization) {
      throw new Error(
        "Could not create an organization for the signed-in user.",
      );
    }
    await organizationRepository.setActiveOrganizationId(
      user.id,
      organization.id,
    );
    context = await organizationRepository.getActiveOrganizationForUser(
      user.id,
    );
  }

  if (!context) {
    throw new Error("No active organization is available for this account.");
  }

  const state = await organizationRepository.loadState();
  const memberCount = state.memberships.filter(
    (membership) =>
      membership.organizationId === context.organization.id &&
      membership.status === "active",
  ).length;
  const accessChecks = await Promise.all(
    visibleOrganizationChecks.map(async (permission) => ({
      permission,
      label: organizationAccessCheckLabels[permission],
      decision: await organizationRepository.checkOrganizationAccess(
        user.id,
        context.organization.id,
        permission,
      ),
    })),
  );

  return {
    state,
    context,
    memberCount,
    accessChecks,
  };
}

function filterOrganizationSummaries(
  summaries: WorkshopSummary[],
  organizationId: string | undefined,
) {
  if (!organizationId) {
    return summaries;
  }

  return summaries.filter(
    (summary) =>
      !summary.organizationId || summary.organizationId === organizationId,
  );
}

function ensureRecordForOrganization(
  record: WorkshopRecord | null,
  organizationId: string,
) {
  if (!record) {
    return null;
  }

  if (record.organizationId && record.organizationId !== organizationId) {
    return null;
  }

  return scopeWorkshopRecord(record, organizationId);
}

function scopeWorkshopRecord(
  record: WorkshopRecord,
  organizationId: string | undefined,
): WorkshopRecord {
  if (!organizationId || record.organizationId === organizationId) {
    return record;
  }

  return {
    ...record,
    organizationId,
  };
}

function migrateSession(session: Partial<WorkshopSession>): WorkshopSession {
  const fallback = createInitialWorkshopSession();
  return {
    ...fallback,
    ...session,
    id: session.id ?? fallback.id,
    title: session.title ?? fallback.title,
    participants: session.participants ?? fallback.participants,
    messages: session.messages ?? fallback.messages,
    attachments: session.attachments ?? [],
    artifacts: session.artifacts ?? [],
    links: session.links ?? [],
    prototypes: session.prototypes ?? [],
    visualizationMode: session.visualizationMode ?? fallback.visualizationMode,
    followDiscussion: session.followDiscussion ?? fallback.followDiscussion,
    updatedAt: session.updatedAt ?? fallback.updatedAt,
  };
}

function loadSeenInsightIdsByParticipant() {
  try {
    const raw = window.localStorage.getItem(seenInsightsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([participantId, artifactIds]) => [
        participantId,
        Array.isArray(artifactIds)
          ? artifactIds.filter(
              (artifactId): artifactId is string =>
                typeof artifactId === "string",
            )
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function downloadReport(report: WorkshopReport) {
  const blob = new Blob([renderReportMarkdown(report)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ai-requirement-workshop-report.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadWorkshopRecord(record: WorkshopRecord) {
  const exportEnvelope = createWorkshopRecordExport(record);
  const blob = new Blob([`${JSON.stringify(exportEnvelope, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeDownloadName(record.title || record.id)}.ai-workshop.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toBackupStatus(
  browserSavedAt: string,
  diskBackup: DiskBackupResult,
): BackupStatus {
  if (diskBackup.status === "saved") {
    return {
      state: "saved",
      browserSavedAt,
      diskBackedUpAt: diskBackup.backedUpAt,
      message: diskBackup.message,
    };
  }

  return {
    state: diskBackup.status,
    browserSavedAt,
    message: diskBackup.message,
  };
}

function safeDownloadName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "ai-requirement-workshop"
  );
}

function formatTime(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function shortArtifactName(artifact?: WorkshopArtifact) {
  if (!artifact) {
    return "artifact";
  }
  return artifact.title.length > 22
    ? `${artifact.title.slice(0, 19)}...`
    : artifact.title;
}

function insightsForParticipant(
  artifacts: WorkshopArtifact[],
  participantId: string,
) {
  return artifacts.filter((artifact) => artifact.createdBy === participantId);
}

export default App;
