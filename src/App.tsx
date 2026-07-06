import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
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
import { AuthShell } from "./auth/AuthShell";
import { CODEX_MODEL } from "./codex/constants";
import {
  fetchCodexStatus,
  requestCodexWorkshopTurn,
  type CodexStatus,
} from "./codex/client";
import { applyCodexWorkshopTurn } from "./domain/codexWorkshop";
import type { AttachmentDraft } from "./domain/attachments";
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
  mirrorWorkshopRecordToDisk,
  type DiskBackupResult,
} from "./persistence/workshopBackup";

const storageKey = "ai-requirement-workshop:v1-session";
const seenInsightsStorageKey = "ai-requirement-workshop:v1-seen-agent-insights";

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
  const [initialWorkshopState] = useState(() => loadInitialWorkshopState());
  const [session, setSession] = useState<WorkshopSession>(
    initialWorkshopState.session,
  );
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

    initializeWorkshopStore(
      initialWorkshopState.session,
      initialWorkshopState.seenInsightIdsByParticipant,
    )
      .then(({ record, summaries }) => {
        if (!isMounted) {
          return;
        }
        setSession(record.session);
        setSeenInsightIdsByParticipant(record.seenInsightIdsByParticipant);
        setActiveWorkshopIdState(record.id);
        setWorkshopSummaries(summaries);
        setIsStoreReady(true);
      })
      .catch(() => {
        if (isMounted) {
          setIsStoreReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialWorkshopState]);

  useEffect(() => {
    if (!isStoreReady) {
      return;
    }

    const record = createWorkshopRecord(session, seenInsightIdsByParticipant);
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
        const summaries = await workshopRepository.listSummaries();
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
  }, [isStoreReady, seenInsightIdsByParticipant, session]);

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
    setDraft("");
    setPendingAttachments([]);
    setCodexError(null);
    setIsCodexThinking(true);

    try {
      const turn = await requestCodexWorkshopTurn(
        session,
        message,
        attachmentsForTurn,
      );
      setSession((current) =>
        applyCodexWorkshopTurn(current, message, turn, attachmentsForTurn),
      );
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
  }, []);

  const handleCreateWorkshop = useCallback(() => {
    const next = createInitialWorkshopSession();
    setSession(next);
    setPendingAttachments([]);
    setDraft("");
    setSelectedInsightParticipantId(null);
    setSeenInsightIdsByParticipant({});
    setActiveWorkshopIdState(next.id);
    workshopRepository.setActiveWorkshopId(next.id);
  }, []);

  const handleExportWorkshop = useCallback(() => {
    const record = createWorkshopRecord(session, seenInsightIdsByParticipant);
    downloadWorkshopRecord(record);
  }, [seenInsightIdsByParticipant, session]);

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
        const record = parseWorkshopRecordExport(await file.text());
        await workshopRepository.saveRecord(record);
        workshopRepository.setActiveWorkshopId(record.id);
        setSession(record.session);
        setPendingAttachments([]);
        setDraft("");
        setSeenInsightIdsByParticipant(record.seenInsightIdsByParticipant);
        setSelectedInsightParticipantId(null);
        setActiveWorkshopIdState(record.id);
        setWorkshopSummaries(await workshopRepository.listSummaries());
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
    [],
  );

  const handleOpenWorkshop = useCallback(async (workshopId: string) => {
    const record = await workshopRepository.loadRecord(workshopId);
    if (!record) {
      return;
    }

    setSession(record.session);
    setPendingAttachments([]);
    setDraft("");
    setSeenInsightIdsByParticipant(record.seenInsightIdsByParticipant);
    setSelectedInsightParticipantId(null);
    setActiveWorkshopIdState(record.id);
    workshopRepository.setActiveWorkshopId(record.id);
  }, []);

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
      setSession((current) =>
        updateArtifactStatus(current, artifactId, status),
      );
    },
    [],
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
    <AuthProvider>
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
                onChange={(event) =>
                  void handleOpenWorkshop(event.target.value)
                }
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
            <button
              className="ghost-button"
              type="button"
              onClick={handleReset}
            >
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
          <section
            className="canvas-pane"
            aria-label="Zoomable workshop canvas"
          >
            <div className="canvas-header">
              <div>
                <p className="eyebrow">Live canvas</p>
                <h2>{session.title}</h2>
              </div>
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
                <Panel position="top-left" className="canvas-panel">
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
                </Panel>
              </ReactFlow>
            </div>
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
                  <article
                    className={`message ${message.kind}`}
                    key={message.id}
                  >
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
                accept=".txt,.md,.csv,.json,.docx,.xlsx,.xls,text/*,application/json"
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
              {codexError ? (
                <p className="composer-error">{codexError}</p>
              ) : null}
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
    </AuthProvider>
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
  const fallback = createInitialWorkshopSession();
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

function loadInitialWorkshopState() {
  return {
    session: loadSession(),
    seenInsightIdsByParticipant: loadSeenInsightIdsByParticipant(),
  };
}

async function initializeWorkshopStore(
  fallbackSession: WorkshopSession,
  fallbackSeenInsightIdsByParticipant: SeenInsightIdsByParticipant,
): Promise<{ record: WorkshopRecord; summaries: WorkshopSummary[] }> {
  const activeWorkshopId = workshopRepository.getActiveWorkshopId();
  const summaries = await workshopRepository.listSummaries();
  const activeRecord = activeWorkshopId
    ? await workshopRepository.loadRecord(activeWorkshopId)
    : null;
  const latestRecord = summaries[0]
    ? await workshopRepository.loadRecord(summaries[0].id)
    : null;
  const record =
    activeRecord ??
    latestRecord ??
    createWorkshopRecord(fallbackSession, fallbackSeenInsightIdsByParticipant);

  await workshopRepository.saveRecord(record);
  workshopRepository.setActiveWorkshopId(record.id);

  const nextSummaries = await workshopRepository.listSummaries();
  return {
    record,
    summaries:
      nextSummaries.length > 0 ? nextSummaries : [toWorkshopSummary(record)],
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
