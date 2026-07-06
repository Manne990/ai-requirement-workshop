import { Eye, MessageSquare, RefreshCcw, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  calculatePrototypeCoverage,
  getCurrentPrototypeVersion,
  renderPrototypePreviewHtml,
  selectCurrentPrototype,
  selectPrototypeRequirementRefs,
  type PrototypeFeedbackInput,
} from "../domain/prototype";
import type { WorkshopSession } from "../domain/workshop";
import "./PrototypePanel.css";

type PrototypePanelProps = {
  session: WorkshopSession;
  modelName: string;
  onGeneratePrototype: () => void;
  onRecordFeedback: (input: PrototypeFeedbackInput) => void;
};

export function PrototypePanel({
  session,
  modelName,
  onGeneratePrototype,
  onRecordFeedback,
}: PrototypePanelProps) {
  const [feedbackBody, setFeedbackBody] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("");
  const requirements = useMemo(
    () => selectPrototypeRequirementRefs(session),
    [session],
  );
  const prototype = useMemo(() => selectCurrentPrototype(session), [session]);
  const currentVersion = prototype
    ? getCurrentPrototypeVersion(prototype)
    : undefined;
  const coverage = currentVersion
    ? calculatePrototypeCoverage(currentVersion, requirements)
    : [];
  const selectedElement =
    currentVersion?.elements.find(
      (element) => element.id === selectedElementId,
    ) ?? currentVersion?.elements[0];
  const previewHtml = currentVersion
    ? renderPrototypePreviewHtml({
        ...currentVersion,
        coverage,
      })
    : "";
  const coveredCount = coverage.filter(
    (item) => item.status === "covered",
  ).length;

  const handleFeedbackSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prototype || !currentVersion || !feedbackBody.trim()) {
      return;
    }

    onRecordFeedback({
      prototypeId: prototype.id,
      prototypeVersionId: currentVersion.id,
      elementId: selectedElement?.id,
      body: feedbackBody,
    });
    setFeedbackBody("");
  };

  return (
    <section className="prototype-pane" aria-label="Prototype preview">
      <div className="prototype-header">
        <div>
          <p className="eyebrow">Prototype</p>
          <h2>Preview</h2>
          <span>
            {requirements.length} source requirement
            {requirements.length === 1 ? "" : "s"} · {modelName}
          </span>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={onGeneratePrototype}
          disabled={requirements.length === 0}
        >
          {prototype ? (
            <RefreshCcw aria-hidden="true" size={16} />
          ) : (
            <Sparkles aria-hidden="true" size={16} />
          )}
          {prototype ? "Regenerate" : "Generate prototype"}
        </button>
      </div>

      {currentVersion ? (
        <>
          <div className="prototype-version-row">
            <span>v{currentVersion.version}</span>
            <span>{currentVersion.status}</span>
            <span>
              {coveredCount}/{coverage.length} covered
            </span>
          </div>

          <div className="prototype-frame-wrap">
            <iframe
              className="prototype-frame"
              title="Generated prototype preview"
              sandbox=""
              srcDoc={previewHtml}
            />
          </div>

          <div className="prototype-coverage" aria-label="Prototype coverage">
            {coverage.map((item) => (
              <span
                className={`coverage-pill coverage-${item.status}`}
                key={item.requirementId}
              >
                {item.requirementTitle}
              </span>
            ))}
          </div>

          <form className="prototype-feedback" onSubmit={handleFeedbackSubmit}>
            <label htmlFor="prototype-element-select">Element</label>
            <select
              id="prototype-element-select"
              value={selectedElement?.id ?? ""}
              onChange={(event) => setSelectedElementId(event.target.value)}
            >
              {currentVersion.elements.map((element) => (
                <option value={element.id} key={element.id}>
                  {element.title}
                </option>
              ))}
            </select>
            <label htmlFor="prototype-feedback-input">Prototype feedback</label>
            <textarea
              id="prototype-feedback-input"
              rows={3}
              value={feedbackBody}
              onChange={(event) => setFeedbackBody(event.target.value)}
              placeholder="Example: change the status card to show stale data risk before dispatch."
            />
            <button
              className="primary-button"
              type="submit"
              disabled={!feedbackBody.trim()}
            >
              <MessageSquare aria-hidden="true" size={16} />
              Add feedback
            </button>
          </form>
        </>
      ) : (
        <div className="prototype-empty">
          <Eye aria-hidden="true" size={24} />
          <p>
            Accept or draft requirement artifacts, then generate a first
            prototype version.
          </p>
        </div>
      )}
    </section>
  );
}
