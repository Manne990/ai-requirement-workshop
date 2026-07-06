import type { AttachmentDraft } from "./attachments";
import {
  checkWorkshopAccess,
  type OrganizationAccessDecision,
  type OrganizationScopedWorkshop,
  type OrganizationState,
} from "./organization";
import type { WorkshopSession } from "./workshop";

export type SensitiveFindingKind =
  | "openai-api-key"
  | "bearer-token"
  | "jwt"
  | "private-key"
  | "credential-assignment"
  | "swedish-personal-number"
  | "email-address";

export type SensitiveFindingSeverity = "low" | "medium" | "high" | "critical";

export type SensitiveFinding = {
  kind: SensitiveFindingKind;
  label: string;
  severity: SensitiveFindingSeverity;
  count: number;
};

export type SensitiveTextAssessment = {
  originalLength: number;
  redactedText: string;
  findings: SensitiveFinding[];
  requiresManualReview: boolean;
};

export type SafeAiWorkshopPayload = {
  message: string;
  session: {
    title: string;
    visualizationMode: WorkshopSession["visualizationMode"];
    followDiscussion: boolean;
    participants: {
      id: string;
      type: string;
      name: string;
      perspective: string;
      status: string;
      currentActivity: string;
    }[];
    recentMessages: {
      participantId: string;
      kind: string;
      body: string;
    }[];
    artifacts: {
      id: string;
      type: string;
      title: string;
      content: string;
      status: string;
      createdBy: string;
      tags: string[];
    }[];
    attachments: {
      id: string;
      name: string;
      mimeType: string;
      size: number;
      status: string;
      summary: string;
      tags: string[];
    }[];
  };
  attachments: {
    name: string;
    mimeType: string;
    size: number;
    status: string;
    summary: string;
    extractedText: string;
    tags: string[];
  }[];
  privacyDisclosure: string;
  redactions: SensitiveFinding[];
  scope?: {
    organizationId: string;
    workshopId: string;
    actorUserId: string;
  };
};

export type SafeAiWorkshopBoundary = {
  payload: SafeAiWorkshopPayload;
  redactions: SensitiveFinding[];
  disclosure: string;
  accessDecision?: OrganizationAccessDecision;
};

export type BuildSafeAiWorkshopPayloadInput = {
  session: WorkshopSession;
  message: string;
  attachments?: AttachmentDraft[];
  organizationState?: OrganizationState;
  actorUserId?: string;
  workshop?: OrganizationScopedWorkshop;
  maxAttachmentTextLength?: number;
};

type SensitiveRule = {
  kind: SensitiveFindingKind;
  label: string;
  severity: SensitiveFindingSeverity;
  pattern: RegExp;
};

export const aiProcessingDisclosure =
  "AI workshop assistance uses the current workshop message, recent canvas context, and redacted attachment extracts only. Secrets and personal identifiers are redacted before AI payload construction.";

const defaultAttachmentTextLimit = 6000;

const sensitiveRules: SensitiveRule[] = [
  {
    kind: "private-key",
    label: "private-key",
    severity: "critical",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "bearer-token",
    label: "bearer-token",
    severity: "high",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  },
  {
    kind: "jwt",
    label: "jwt",
    severity: "high",
    pattern:
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    kind: "openai-api-key",
    label: "api-key",
    severity: "high",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "credential-assignment",
    label: "credential",
    severity: "high",
    pattern:
      /\b(?:password|passcode|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|service[_-]?role(?:[_-]?key)?|supabase[_-]?service[_-]?role[_-]?key|token)\s*[:=]\s*["']?[^"'\s,;]{6,}["']?/gi,
  },
  {
    kind: "swedish-personal-number",
    label: "personal-id",
    severity: "high",
    pattern: /\b(?:19|20)?\d{6}[-+]?\d{4}\b/g,
  },
  {
    kind: "email-address",
    label: "email",
    severity: "low",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
];

export function assessSensitiveText(text: string): SensitiveTextAssessment {
  let redactedText = text;
  const findings: SensitiveFinding[] = [];

  for (const rule of sensitiveRules) {
    const matches = [...redactedText.matchAll(rule.pattern)];
    if (matches.length === 0) {
      continue;
    }

    findings.push({
      kind: rule.kind,
      label: rule.label,
      severity: rule.severity,
      count: matches.length,
    });
    redactedText = redactedText.replace(
      rule.pattern,
      `[REDACTED:${rule.label}]`,
    );
  }

  return {
    originalLength: text.length,
    redactedText,
    findings,
    requiresManualReview: findings.some(
      (finding) =>
        finding.severity === "high" || finding.severity === "critical",
    ),
  };
}

export function redactSensitiveText(text: string): string {
  return assessSensitiveText(text).redactedText;
}

export function mergeSensitiveFindings(
  findings: SensitiveFinding[],
): SensitiveFinding[] {
  const byKind = new Map<SensitiveFindingKind, SensitiveFinding>();

  for (const finding of findings) {
    const current = byKind.get(finding.kind);
    if (!current) {
      byKind.set(finding.kind, { ...finding });
      continue;
    }

    byKind.set(finding.kind, {
      ...current,
      count: current.count + finding.count,
      severity: strongerSeverity(current.severity, finding.severity),
    });
  }

  return [...byKind.values()].sort((left, right) =>
    left.kind.localeCompare(right.kind),
  );
}

export function buildSafeAiWorkshopPayload(
  input: BuildSafeAiWorkshopPayloadInput,
): SafeAiWorkshopBoundary {
  const accessDecision = checkAiPromptAccess(input);
  const findings: SensitiveFinding[] = [];
  const safeText = (text: string, maxLength?: number) => {
    const assessment = assessSensitiveText(text);
    findings.push(...assessment.findings);
    return truncateText(assessment.redactedText, maxLength);
  };
  const payload: SafeAiWorkshopPayload = {
    message: safeText(input.message),
    session: {
      title: safeText(input.session.title),
      visualizationMode: input.session.visualizationMode,
      followDiscussion: input.session.followDiscussion,
      participants: input.session.participants.map((participant) => ({
        id: participant.id,
        type: participant.type,
        name: safeText(participant.name),
        perspective: safeText(participant.perspective),
        status: participant.status,
        currentActivity: safeText(participant.currentActivity),
      })),
      recentMessages: input.session.messages.slice(-8).map((message) => ({
        participantId: message.participantId,
        kind: message.kind,
        body: safeText(message.body),
      })),
      artifacts: input.session.artifacts.slice(-24).map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        title: safeText(artifact.title),
        content: safeText(artifact.content),
        status: artifact.status,
        createdBy: artifact.createdBy,
        tags: safeTags(artifact.tags),
      })),
      attachments: (input.session.attachments ?? [])
        .slice(-12)
        .map((attachment) => ({
          id: attachment.id,
          name: safeText(attachment.name),
          mimeType: attachment.mimeType,
          size: attachment.size,
          status: attachment.status,
          summary: safeText(attachment.summary),
          tags: safeTags(attachment.tags),
        })),
    },
    attachments: (input.attachments ?? []).slice(0, 12).map((attachment) => ({
      name: safeText(attachment.name),
      mimeType: attachment.mimeType,
      size: attachment.size,
      status: attachment.status,
      summary: safeText(attachment.summary),
      extractedText: safeText(
        attachment.extractedText,
        input.maxAttachmentTextLength ?? defaultAttachmentTextLimit,
      ),
      tags: safeTags(attachment.tags),
    })),
    privacyDisclosure: aiProcessingDisclosure,
    redactions: [],
  };
  const redactions = mergeSensitiveFindings(findings);

  payload.redactions = redactions;

  if (input.workshop && input.actorUserId) {
    payload.scope = {
      organizationId: input.workshop.organizationId,
      workshopId: input.workshop.id,
      actorUserId: input.actorUserId,
    };
  }

  return {
    payload,
    redactions,
    disclosure: aiProcessingDisclosure,
    accessDecision,
  };

  function safeTags(tags: string[]) {
    return tags.slice(0, 8).map((tag) => safeText(tag, 80));
  }
}

function checkAiPromptAccess(
  input: BuildSafeAiWorkshopPayloadInput,
): OrganizationAccessDecision | undefined {
  const accessCheckRequested = Boolean(
    input.organizationState || input.actorUserId || input.workshop,
  );

  if (!accessCheckRequested) {
    return undefined;
  }

  if (!input.organizationState || !input.actorUserId || !input.workshop) {
    throw new Error(
      "AI prompt access check requires organization state, actor user, and workshop scope.",
    );
  }

  const decision = checkWorkshopAccess(
    input.organizationState,
    input.actorUserId,
    input.workshop,
    "comment-workshop",
  );

  if (!decision.allowed) {
    throw new Error(`AI prompt construction denied: ${decision.reason}.`);
  }

  return decision;
}

function truncateText(text: string, maxLength?: number) {
  if (!maxLength || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function strongerSeverity(
  left: SensitiveFindingSeverity,
  right: SensitiveFindingSeverity,
): SensitiveFindingSeverity {
  const rank: Record<SensitiveFindingSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return rank[left] >= rank[right] ? left : right;
}
