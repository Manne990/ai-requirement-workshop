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
  Lightbulb,
  MessageSquare,
  Pause,
  RefreshCcw,
  Send,
  ShieldAlert,
  Sparkles,
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
import {
  createInitialWorkshopSession,
  generateWorkshopReport,
  renderReportMarkdown,
  selectArtifact,
  setFollowDiscussion,
  setVisualizationMode,
  submitHumanMessage,
  updateArtifactStatus,
  type ArtifactStatus,
  type ArtifactType,
  type Participant,
  type VisualizationMode,
  type WorkshopArtifact,
  type WorkshopReport,
  type WorkshopSession,
} from "./domain/workshop";

const storageKey = "ai-requirement-workshop:v1-session";

type ArtifactNodeData = {
  artifact: WorkshopArtifact;
  onSelect: (artifactId: string) => void;
  onStatusChange: (artifactId: string, status: ArtifactStatus) => void;
};

const artifactIconMap: Record<ArtifactType, typeof ClipboardList> = {
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
  const [session, setSession] = useState<WorkshopSession>(() => loadSession());
  const [draft, setDraft] = useState("");
  const [report, setReport] = useState<WorkshopReport>(() =>
    generateWorkshopReport(loadSession()),
  );
  const [isReportOpen, setIsReportOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, [session]);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSession((current) => submitHumanMessage(current, draft));
    setDraft("");
  };

  const handleSelectArtifact = useCallback((artifactId: string) => {
    setSession((current) => selectArtifact(current, artifactId));
  }, []);

  const handleStatusChange = useCallback(
    (artifactId: string, status: ArtifactStatus) => {
      setSession((current) =>
        updateArtifactStatus(current, artifactId, status),
      );
    },
    [],
  );

  const artifactNodes = useMemo<Node<ArtifactNodeData>[]>(
    () =>
      session.artifacts.map((artifact, index) => ({
        id: artifact.id,
        type: "artifact",
        position: artifactPosition(artifact, index, session.visualizationMode),
        data: {
          artifact,
          onSelect: handleSelectArtifact,
          onStatusChange: handleStatusChange,
        },
      })),
    [
      handleSelectArtifact,
      handleStatusChange,
      session.artifacts,
      session.visualizationMode,
    ],
  );

  const artifactEdges = useMemo<Edge[]>(
    () =>
      session.links.map((link) => ({
        id: link.id,
        source: link.sourceArtifactId,
        target: link.targetArtifactId,
        label: link.label,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        className: "artifact-edge",
      })),
    [session.links],
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
          <button
            className="ghost-button"
            type="button"
            onClick={() => setSession(createInitialWorkshopSession())}
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
        <section className="canvas-pane" aria-label="Zoomable workshop canvas">
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
            <textarea
              id="workshop-input"
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Example: SOS operators need a way to compare incoming incident data against earlier calls without slowing dispatch..."
            />
            <button
              className="primary-button"
              type="submit"
              disabled={!draft.trim()}
            >
              <Send aria-hidden="true" size={18} />
              Send
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

        <div className="participants-strip">
          {session.participants.map((participant) => (
            <ParticipantChip participant={participant} key={participant.id} />
          ))}
        </div>
      </section>

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

function ArtifactNode({ data }: NodeProps<Node<ArtifactNodeData>>) {
  const { artifact, onSelect, onStatusChange } = data;
  const Icon = artifactIconMap[artifact.type];

  return (
    <article className={`artifact-node status-${artifact.status}`}>
      <Handle
        className="artifact-handle"
        type="target"
        position={Position.Left}
      />
      <Handle
        className="artifact-handle"
        type="source"
        position={Position.Right}
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

function ParticipantChip({ participant }: { participant: Participant }) {
  const Icon =
    participant.type === "human"
      ? UserRound
      : participant.type === "facilitator"
        ? Sparkles
        : Bot;

  return (
    <article className={`participant-chip status-${participant.status}`}>
      <Icon aria-hidden="true" size={18} />
      <div>
        <h3>{participant.name}</h3>
        <p>{participant.currentActivity}</p>
        <span>{participant.perspective}</span>
      </div>
    </article>
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
    return JSON.parse(raw) as WorkshopSession;
  } catch {
    return fallback;
  }
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

function artifactPosition(
  artifact: WorkshopArtifact,
  index: number,
  mode: VisualizationMode,
): { x: number; y: number } {
  if (mode === "requirements") {
    const typeOrder: ArtifactType[] = [
      "goal",
      "problem",
      "actor",
      "requirement",
      "question",
      "decision",
      "assumption",
      "risk",
      "flow-step",
    ];
    const column = Math.max(0, typeOrder.indexOf(artifact.type));
    return { x: column * 270, y: (index % 3) * 210 };
  }

  if (mode === "risks") {
    const riskLane =
      artifact.type === "risk" || artifact.type === "assumption" ? 0 : 1;
    return {
      x: (index % 5) * 290,
      y: riskLane * 260 + Math.floor(index / 5) * 120,
    };
  }

  if (mode === "journey") {
    return {
      x: index * 260,
      y: artifact.type === "actor" ? 10 : 230 + (index % 2) * 120,
    };
  }

  return { x: (index % 4) * 300, y: Math.floor(index / 4) * 240 };
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

export default App;
