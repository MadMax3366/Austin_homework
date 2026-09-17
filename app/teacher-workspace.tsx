"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  CalendarOff,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  LogOut,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import type { AttendanceStatus, FeedbackDraft } from "@/lib/domain";
import type {
  ApiErrorBody,
  CompleteClassResult,
  FeedbackDraftResult,
  TeacherWorkspaceData,
} from "@/lib/types";

type Viewer = {
  displayName: string;
  email: string;
  signOutPath: string;
};

type AttendanceDraftStatus = AttendanceStatus | null;

type WorkspaceDraft = {
  attendance: Record<string, AttendanceDraftStatus>;
  classNotes: string;
  feedback: FeedbackDraft | null;
};

type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  execute(
    input: unknown,
    options?: { signal?: AbortSignal },
  ): unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: ModelContextTool,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

class ClientApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
];

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  const abortFromCaller = () => controller.abort();
  init?.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const responseText = await response.text();
    let payload: T | ApiErrorBody | null = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as T | ApiErrorBody;
      } catch {
        throw new ClientApiError(
          "INVALID_SERVER_RESPONSE",
          "The server returned an unreadable response.",
          response.status,
        );
      }
    }
    if (!response.ok) {
      const error = payload as ApiErrorBody | null;
      throw new ClientApiError(
        error?.error?.code ?? "REQUEST_FAILED",
        error?.error?.message ?? "The request failed.",
        response.status,
      );
    }
    if (!payload) {
      throw new ClientApiError(
        "EMPTY_SERVER_RESPONSE",
        "The server returned an empty response.",
        response.status,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ClientApiError) throw error;
    if (controller.signal.aborted) {
      throw new ClientApiError(
        timedOut ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED",
        timedOut
          ? "The request timed out. Your draft has been kept."
          : "The request was cancelled.",
        0,
      );
    }
    throw new ClientApiError(
      "NETWORK_UNAVAILABLE",
      "The network is unavailable. Your draft has been kept.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function displayTime(value: string): string {
  const [hourValue, minute] = value.split(":").map(Number);
  const suffix = hourValue >= 12 ? "pm" : "am";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function displayMoney(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 4);
}

function WorkspaceLoading({ viewer }: { viewer: Viewer }) {
  return (
    <WorkspaceFrame viewer={viewer}>
      <div className="mx-auto max-w-[1040px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        <div className="space-y-3 border-b border-border pb-6">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <p className="sr-only" role="status">Loading today’s classes…</p>
      </div>
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-[var(--navy-800)] bg-[var(--navy-950)] text-white">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]" aria-label="Switch workspace">
              <BookOpen className="size-[18px]" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight">
                Austin Education
              </p>
              <p className="truncate text-xs text-slate-300">
                Teacher workspace
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-medium">
                {viewer.displayName}
              </p>
              <p className="text-xs text-slate-300">Teacher</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold">
              {initials(viewer.displayName)}
            </span>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <a href={viewer.signOutPath} target="_top" aria-label="Sign out">
                <LogOut />
              </a>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <Toaster position="bottom-center" />
    </main>
  );
}

export function TeacherWorkspace({ viewer }: { viewer: Viewer }) {
  const [data, setData] = useState<TeacherWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceDraftStatus>
  >({});
  const [classNotes, setClassNotes] = useState("");
  const [feedback, setFeedback] = useState<FeedbackDraft | null>(null);
  const [feedbackSource, setFeedbackSource] = useState<
    "ai" | "fallback" | null
  >(null);
  const [feedbackWarning, setFeedbackWarning] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const idempotencyKey = useRef("");
  const intentSessionId = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const feedbackAbort = useRef<AbortController | null>(null);

  const applyWorkspace = useCallback((workspace: TeacherWorkspaceData) => {
    const session = workspace.selectedSession;
    const serverDraft: WorkspaceDraft = {
      attendance: Object.fromEntries(
        workspace.roster.map((student) => [
          student.id,
          student.attendanceStatus,
        ]),
      ),
      classNotes: workspace.rawClassNotes,
      feedback: workspace.feedback,
    };
    let nextDraft = serverDraft;
    let restored = false;
    if (session?.status === "scheduled") {
      const stored = window.sessionStorage.getItem(`aus-draft:${session.id}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as WorkspaceDraft;
          const rosterIds = new Set(workspace.roster.map((student) => student.id));
          if (
            Object.keys(parsed.attendance).every((id) => rosterIds.has(id)) &&
            parsed.classNotes.length <= 4_000
          ) {
            nextDraft = parsed;
            restored = true;
          }
        } catch {
          window.sessionStorage.removeItem(`aus-draft:${session.id}`);
        }
      }
    }

    setData(workspace);
    setAttendance(nextDraft.attendance);
    setClassNotes(nextDraft.classNotes);
    setFeedback(nextDraft.feedback);
    setFeedbackSource(null);
    setFeedbackWarning(null);
    setActionError(null);
    setDirty(restored);
    if (
      session &&
      (intentSessionId.current !== session.id || !idempotencyKey.current)
    ) {
      idempotencyKey.current = crypto.randomUUID();
      intentSessionId.current = session.id;
    }
    if (session?.status === "completed") {
      window.sessionStorage.removeItem(`aus-draft:${session.id}`);
    }
  }, []);

  const loadWorkspace = useCallback(
    async (sessionId?: string | null) => {
      const sequence = ++loadSequence.current;
      loadAbort.current?.abort();
      const controller = new AbortController();
      loadAbort.current = controller;
      setLoading(true);
      setLoadError(null);
      setLoadErrorCode(null);
      try {
        const suffix = sessionId
          ? `?sessionId=${encodeURIComponent(sessionId)}`
          : "";
        const workspace = await requestJson<TeacherWorkspaceData>(
          `/api/workspace${suffix}`,
          { signal: controller.signal },
        );
        if (sequence !== loadSequence.current) return null;
        applyWorkspace(workspace);
        return workspace;
      } catch (error) {
        if (
          error instanceof ClientApiError &&
          error.code === "REQUEST_CANCELLED"
        ) {
          return null;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : "Today’s classes could not be loaded.",
        );
        setLoadErrorCode(
          error instanceof ClientApiError ? error.code : "REQUEST_FAILED",
        );
        return null;
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [applyWorkspace],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    const session = data?.selectedSession;
    if (!dirty || !session || session.status !== "scheduled") return;
    const draft: WorkspaceDraft = { attendance, classNotes, feedback };
    window.sessionStorage.setItem(
      `aus-draft:${session.id}`,
      JSON.stringify(draft),
    );
  }, [attendance, classNotes, data?.selectedSession, dirty, feedback]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(
    () => () => {
      loadAbort.current?.abort();
      feedbackAbort.current?.abort();
    },
    [],
  );

  const requestSessionSwitch = useCallback(
    (sessionId: string) => {
      if (saving || generating || sessionId === data?.selectedSession?.id) return;
      if (dirty) {
        setPendingSessionId(sessionId);
        setSwitchOpen(true);
        return;
      }
      void loadWorkspace(sessionId);
    },
    [data?.selectedSession?.id, dirty, generating, loadWorkspace, saving],
  );

  const discardAndSwitch = useCallback(() => {
    const currentId = data?.selectedSession?.id;
    if (currentId) window.sessionStorage.removeItem(`aus-draft:${currentId}`);
    const destination = pendingSessionId;
    setDirty(false);
    setSwitchOpen(false);
    setPendingSessionId(null);
    if (destination) void loadWorkspace(destination);
  }, [data?.selectedSession?.id, loadWorkspace, pendingSessionId]);

  const billableCount = useMemo(
    () =>
      data?.roster.filter(
        (student) =>
          student.billingPolicy === "billable" &&
          (attendance[student.id] === "present" || attendance[student.id] === "late"),
      ).length ?? 0,
    [attendance, data],
  );
  const unmarkedCount = useMemo(
    () => data?.roster.filter((student) => !attendance[student.id]).length ?? 0,
    [attendance, data],
  );
  const absentCount = useMemo(
    () =>
      data?.roster.filter((student) => attendance[student.id] === "absent")
        .length ?? 0,
    [attendance, data],
  );
  const lowBalanceCount = useMemo(
    () =>
      data?.roster.filter(
        (student) => student.billingPolicy === "billable" && student.balance <= 3,
      ).length ?? 0,
    [data],
  );
  const potentialPendingCount = useMemo(
    () =>
      data?.roster.filter(
        (student) =>
          (attendance[student.id] === "present" ||
            attendance[student.id] === "late") &&
          student.billingPolicy === "billable" &&
          student.balance < 1,
      ).length ?? 0,
    [attendance, data],
  );

  const performComplete = useCallback(
    async (
      records: { studentId: string; status: AttendanceStatus }[],
      rawClassNotes: string,
      feedbackDraft: FeedbackDraft | null,
      signal?: AbortSignal,
    ) => {
      const session = data?.selectedSession;
      if (!session) throw new Error("No class is selected.");
      setSaving(true);
      setActionError(null);
      try {
        const result = await requestJson<CompleteClassResult>(
          `/api/sessions/${encodeURIComponent(session.id)}/complete`,
          {
            method: "POST",
            signal,
            headers: { "Idempotency-Key": idempotencyKey.current },
            body: JSON.stringify({
              expectedVersion: session.version,
              records,
              rawClassNotes,
              feedback: feedbackDraft,
            }),
          },
        );

        if (result.pendingCreditCount > 0) {
          toast.warning(
            `Class completed. ${result.pendingCreditCount} attendance charge requires admin review.`,
          );
        } else {
          toast.success(
            result.idempotentReplay
              ? "Class was already completed; no duplicate credits were charged."
              : `Class completed and ${result.chargedCount} lesson credits recorded.`,
          );
        }
        window.sessionStorage.removeItem(`aus-draft:${session.id}`);
        setDirty(false);
        await loadWorkspace(session.id);
        return result;
      } catch (error) {
        if (
          error instanceof ClientApiError &&
          ["REQUEST_TIMEOUT", "NETWORK_UNAVAILABLE"].includes(error.code)
        ) {
          const reconciled = await loadWorkspace(session.id);
          if (reconciled?.selectedSession?.status === "completed") {
            window.sessionStorage.removeItem(`aus-draft:${session.id}`);
            setDirty(false);
            toast.success(
              "The response was interrupted, but the server confirms the class was completed safely.",
            );
            return {
              sessionId: session.id,
              status: "completed" as const,
              version: reconciled.selectedSession.version,
              chargedCount: reconciled.roster.filter(
                (student) => student.billingStatus === "charged",
              ).length,
              absentCount: reconciled.roster.filter(
                (student) => student.attendanceStatus === "absent",
              ).length,
              pendingCreditCount: reconciled.roster.filter(
                (student) =>
                  student.billingStatus === "pending_insufficient_credit",
              ).length,
              idempotentReplay: true,
            };
          }
        }
        const message =
          error instanceof Error ? error.message : "The class could not be saved.";
        setActionError(message);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [data, loadWorkspace],
  );

  async function completeVisibleClass() {
    if (!data?.selectedSession) return;
    if (unmarkedCount > 0) {
      setActionError(
        `Mark every student before completing the class (${unmarkedCount} remaining).`,
      );
      setConfirmOpen(false);
      return;
    }
    if (
      feedback &&
      (!feedback.summary.trim() || !feedback.guardianMessageDraft.trim())
    ) {
      setActionError("The feedback summary and message draft cannot be empty.");
      setConfirmOpen(false);
      return;
    }
    const records = data.roster.map((student) => ({
      studentId: student.id,
      status: attendance[student.id] as AttendanceStatus,
    }));
    setConfirmOpen(false);
    try {
      await performComplete(records, classNotes, feedback);
    } catch {
      // The actionable error is already visible in the page.
    }
  }

  async function generateFeedback() {
    const session = data?.selectedSession;
    if (!session || classNotes.trim().length < 8) {
      setActionError(
        "Add at least a short factual class note before drafting a family update.",
      );
      return;
    }

    setGenerating(true);
    feedbackAbort.current?.abort();
    const controller = new AbortController();
    feedbackAbort.current = controller;
    const requestedSessionId = session.id;
    setActionError(null);
    setFeedbackWarning(null);
    try {
      const result = await requestJson<FeedbackDraftResult>(
        "/api/feedback/draft",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: session.id,
            rawNotes: classNotes,
          }),
        },
      );
      if (intentSessionId.current !== requestedSessionId) return;
      setFeedback(result.draft);
      setFeedbackSource(result.source);
      setFeedbackWarning(result.warning?.message ?? null);
      setDirty(true);
      if (result.source === "fallback") {
        toast.info("AI was unavailable. An editable local draft was created.");
      } else {
        toast.success("Editable family update drafted.");
      }
    } catch (error) {
      if (
        error instanceof ClientApiError &&
        error.code === "REQUEST_CANCELLED"
      ) {
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : "A feedback draft could not be created.",
      );
    } finally {
      if (intentSessionId.current === requestedSessionId) {
        setGenerating(false);
      }
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    const session = data?.selectedSession;
    if (
      !context?.registerTool ||
      !session ||
      session.status !== "scheduled" ||
      !data
    ) {
      return;
    }

    const lifecycle = new AbortController();
    const rosterIds = new Set(data.roster.map((student) => student.id));
    const tool: ModelContextTool = {
      name: "complete_current_class",
      title: "Complete current class",
      description:
        "Finalise attendance for every student in the currently visible class and save the teacher's class note. Present and late students are charged according to server-side policy.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", const: session.id },
          records: {
            type: "array",
            minItems: data.roster.length,
            maxItems: data.roster.length,
            items: {
              type: "object",
              properties: {
                studentId: { type: "string" },
                status: {
                  type: "string",
                  enum: ["present", "late", "absent"],
                },
              },
              required: ["studentId", "status"],
              additionalProperties: false,
            },
          },
          rawClassNotes: { type: "string", maxLength: 4000 },
          confirmed: { type: "boolean", const: true },
        },
        required: ["sessionId", "records", "rawClassNotes", "confirmed"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
      async execute(input, options) {
        if (options?.signal?.aborted) {
          throw new Error("The completion request was cancelled.");
        }
        if (!input || typeof input !== "object") {
          throw new Error("Input must be an object.");
        }
        const candidate = input as {
          sessionId?: unknown;
          records?: unknown;
          rawClassNotes?: unknown;
          confirmed?: unknown;
        };
        if (candidate.sessionId !== session.id) {
          throw new Error("The requested session is not currently visible.");
        }
        if (candidate.confirmed !== true) {
          throw new Error("Explicit confirmation is required.");
        }
        if (!Array.isArray(candidate.records)) {
          throw new Error("records must be an array.");
        }
        const records = candidate.records.map((item) => {
          if (!item || typeof item !== "object") {
            throw new Error("Every attendance record must be an object.");
          }
          const row = item as { studentId?: unknown; status?: unknown };
          if (
            typeof row.studentId !== "string" ||
            !rosterIds.has(row.studentId) ||
            !["present", "late", "absent"].includes(String(row.status))
          ) {
            throw new Error("An attendance record is invalid.");
          }
          return {
            studentId: row.studentId,
            status: row.status as AttendanceStatus,
          };
        });
        if (
          records.length !== data.roster.length ||
          new Set(records.map((row) => row.studentId)).size !==
            data.roster.length
        ) {
          throw new Error("Attendance must include every student exactly once.");
        }
        if (
          typeof candidate.rawClassNotes !== "string" ||
          candidate.rawClassNotes.length > 4_000
        ) {
          throw new Error("rawClassNotes must be 4,000 characters or fewer.");
        }

        setAttendance(
          Object.fromEntries(
            records.map((record) => [record.studentId, record.status]),
          ),
        );
        setClassNotes(candidate.rawClassNotes);
        const result = await performComplete(
          records,
          candidate.rawClassNotes,
          feedback,
          options?.signal,
        );
        return {
          sessionId: result.sessionId,
          status: result.status,
          chargedCount: result.chargedCount,
          pendingCreditCount: result.pendingCreditCount,
        };
      },
    };

    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    } catch {
      // WebMCP is progressive enhancement; the visible workflow remains complete.
    }

    return () => lifecycle.abort();
  }, [data, feedback, performComplete]);

  if (loading) return <WorkspaceLoading viewer={viewer} />;

  if (loadError) {
    return (
      <WorkspaceFrame viewer={viewer}>
        <div className="mx-auto max-w-xl px-5 py-20">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Today’s workspace could not be loaded</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
          {loadErrorCode === "AUTH_REQUIRED" ? (
            <Button asChild className="mt-5">
              <a href="/signin-with-chatgpt?return_to=/" target="_top">
                Sign in again
              </a>
            </Button>
          ) : (
            <Button className="mt-5" onClick={() => void loadWorkspace()}>
              <RefreshCw /> Try again
            </Button>
          )}
        </div>
      </WorkspaceFrame>
    );
  }

  if (!data || !data.selectedSession) {
    return (
      <WorkspaceFrame viewer={viewer}>
        <div className="mx-auto max-w-2xl px-5 py-16">
          <Empty className="border border-border bg-white">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarOff />
              </EmptyMedia>
              <EmptyTitle>No classes assigned today</EmptyTitle>
              <EmptyDescription>
                There is nothing to mark right now. This view uses Melbourne
                dates and will update when a class is assigned.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void loadWorkspace()}>
                <RefreshCw /> Refresh
              </Button>
            </EmptyContent>
          </Empty>
          {data ? (
            <div className="mt-5 rounded-2xl border border-border bg-white p-6">
              <p className="text-sm font-semibold text-muted-foreground">Current payroll period</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--navy-950)]">
                {displayMoney(data.payroll.currentAmountCents)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.payroll.currentPeriod?.status ?? "No open period"} · {data.payroll.recentEntries.length} recent entries
              </p>
            </div>
          ) : null}
        </div>
      </WorkspaceFrame>
    );
  }

  const session = data.selectedSession;
  const completed = session.status === "completed";
  const cancelled = session.status === "cancelled";
  const locked = completed || cancelled;

  return (
    <WorkspaceFrame viewer={viewer}>
      <div className="border-b border-border bg-white px-4 py-3 lg:hidden">
        <nav
          className="mx-auto flex max-w-[1040px] gap-2 overflow-x-auto pb-1"
          aria-label="Today’s classes"
        >
          {data.sessions.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={item.id === session.id ? "default" : "outline"}
              className={
                item.id === session.id
                  ? "bg-[var(--navy-900)] hover:bg-[var(--navy-800)]"
                  : ""
              }
              disabled={saving || generating}
              onClick={() => requestSessionSwitch(item.id)}
            >
              {displayTime(item.startTime)} · {item.subject}
            </Button>
          ))}
        </nav>
      </div>

      <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-border bg-white px-4 py-6 lg:block">
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Today · Melbourne
          </p>
          <nav className="mt-4 space-y-2" aria-label="Today’s classes">
            {data.sessions.map((item) => (
              <button
                key={item.id}
                className={`group w-full rounded-xl border px-3 py-3 text-left transition ${
                  item.id === session.id
                    ? "border-[var(--cyan-500)] bg-[var(--cyan-50)] shadow-[inset_3px_0_0_var(--cyan-500)]"
                    : "border-transparent hover:border-border hover:bg-slate-50"
                }`}
                type="button"
                disabled={saving || generating}
                onClick={() => requestSessionSwitch(item.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--navy-900)]">
                    {displayTime(item.startTime)}
                  </span>
                  {item.status === "completed" ? (
                    <Check
                      className="size-4 text-emerald-600"
                      aria-label="Completed"
                    />
                  ) : (
                    <ChevronRight
                      className="size-4 text-slate-400 transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="mt-1 block text-sm font-medium">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.room} · {item.rosterCount} students
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-[var(--cyan-700)]" />
              Teacher access
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              You can record attendance only for sessions assigned to you.
              Payment details and guardian contacts stay hidden.
            </p>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1040px]">
            <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={
                      completed
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-[var(--cyan-200)] bg-[var(--cyan-50)] text-[var(--cyan-800)]"
                    }
                  >
                    {completed
                      ? "Completed"
                      : cancelled
                        ? "Cancelled"
                      : session.timing === "active"
                        ? "In progress"
                        : session.timing === "upcoming"
                          ? "Upcoming"
                          : "Ready to finalise"}
                  </Badge>
                  <Badge variant="outline">{session.kind}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {displayDate(session.date)}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-[var(--navy-950)] sm:text-[2rem]">
                  {session.title}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-4" />
                    {displayTime(session.startTime)}–{displayTime(session.endTime)}
                  </span>
                  <span>{session.room}</span>
                  <span>Australia/Melbourne</span>
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="summary-card">
                <Users />
                <div>
                  <span>Roster</span>
                  <strong>{data.roster.length} students</strong>
                </div>
              </div>
              <div className="summary-card">
                <WalletCards />
                <div>
                  <span>Current payroll</span>
                  <strong>{displayMoney(data.payroll.currentAmountCents)}</strong>
                </div>
              </div>
              <div className="summary-card">
                <Coins />
                <div>
                  <span>{completed ? "Credits recorded" : "Credits on save"}</span>
                  <strong>
                    {completed
                      ? data.roster.filter(
                          (student) => student.billingStatus === "charged",
                        ).length
                      : billableCount}{" "}
                    deductions
                  </strong>
                </div>
              </div>
              <div className="summary-card">
                <AlertCircle />
                <div>
                  <span>Needs attention</span>
                  <strong>{lowBalanceCount} low balances</strong>
                </div>
              </div>
            </div>

            {lowBalanceCount > 0 && !completed && (
              <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-950">
                <AlertCircle />
                <AlertTitle>
                  Check {lowBalanceCount} low{" "}
                  {lowBalanceCount === 1 ? "balance" : "balances"}
                </AlertTitle>
                <AlertDescription>
                  A present student with no available credit is still recorded
                  truthfully and sent to the admin queue without a negative
                  ledger balance.
                </AlertDescription>
              </Alert>
            )}

            {completed &&
              data.roster.some(
                (student) =>
                  student.billingStatus === "pending_insufficient_credit",
              ) && (
                <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-950">
                  <AlertCircle />
                  <AlertTitle>Admin review required</AlertTitle>
                  <AlertDescription>
                    At least one attendance record could not be charged because
                    the student had no lesson credit. Attendance is saved; the
                    ledger was not overdrawn.
                  </AlertDescription>
                </Alert>
              )}

            {actionError && (
              <Alert variant="destructive" className="mt-5">
                <AlertCircle />
                <AlertTitle>Could not complete that action</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="section-kicker">Step 1 of 2</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--navy-950)]">
                  Take attendance
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Present and late enrolled students use one lesson credit; trial participants are free.
                </p>
                {!locked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setAttendance(
                        Object.fromEntries(
                          data.roster.map((student) => [student.id, "present"]),
                        ),
                      );
                      setDirty(true);
                    }}
                  >
                    <Check /> Mark all present
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_10px_30px_rgb(18_37_58/5%)]">
              <div className="hidden grid-cols-[minmax(220px,1fr)_auto_140px] gap-4 border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
                <span>Student</span>
                <span>Attendance</span>
                <span className="text-right">Lesson balance</span>
              </div>
              <div className="divide-y divide-border">
                {data.roster.map((student) => {
                  const status = attendance[student.id] ?? null;
                  const nextBalance =
                    locked ||
                    status === null ||
                    status === "absent" ||
                    student.billingPolicy === "trial_free"
                      ? student.balance
                      : Math.max(0, student.balance - 1);
                  const pending =
                    locked
                      ? student.billingStatus ===
                        "pending_insufficient_credit"
                      : (status === "present" || status === "late") &&
                        student.billingPolicy === "billable" &&
                        student.balance < 1;

                  return (
                    <article
                      key={student.id}
                      className="grid gap-4 px-4 py-5 sm:px-5 md:grid-cols-[minmax(220px,1fr)_auto_140px] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--navy-100)] text-sm font-semibold text-[var(--navy-800)]">
                          {student.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold text-[var(--navy-950)]">
                              {student.name}
                            </h3>
                            {student.isNew && (
                              <Badge
                                variant="outline"
                                className="border-violet-200 bg-violet-50 text-violet-700"
                              >
                                New
                              </Badge>
                            )}
                            {student.billingPolicy === "trial_free" && (
                              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Trial · no credit</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            Age {student.age}
                          </p>
                        </div>
                      </div>

                      <div>
                        {status === null && (
                          <p className="mb-1 text-xs font-medium text-amber-700">
                            Unmarked
                          </p>
                        )}
                        <RadioGroup
                        value={status ?? undefined}
                        disabled={locked || saving}
                        onValueChange={(value) => {
                          setAttendance((current) => ({
                            ...current,
                            [student.id]: value as AttendanceStatus,
                          }));
                          setDirty(true);
                        }}
                        className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
                        aria-label={`Attendance for ${student.name}`}
                        >
                        {statusOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`rounded-md px-2.5 py-2 text-center text-sm font-medium transition ${
                              locked || saving
                                ? "cursor-default"
                                : "cursor-pointer"
                            } ${
                              status === option.value
                                ? "bg-white text-[var(--navy-950)] shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <RadioGroupItem
                              value={option.value}
                              className="sr-only"
                              aria-label={`${student.name}: ${option.label}`}
                            />
                            {option.label}
                          </label>
                        ))}
                        </RadioGroup>
                      </div>

                      <div className="flex items-center justify-between gap-3 md:block md:text-right">
                        <span className="text-sm text-muted-foreground md:hidden">
                          Lesson balance
                        </span>
                        <div>
                          <p
                            className={`font-semibold tabular-nums ${
                              nextBalance <= 1
                                ? "text-amber-700"
                                : "text-[var(--navy-900)]"
                            }`}
                          >
                            {nextBalance}{" "}
                            <span className="font-normal text-muted-foreground">
                              credits
                            </span>
                          </p>
                          {pending && (
                            <p className="mt-0.5 text-xs font-medium text-amber-700">
                              Admin review
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-8">
              <p className="section-kicker">Step 2 of 2</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--navy-950)]">
                  Add class notes
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={
                    locked ||
                    saving ||
                    generating ||
                    classNotes.trim().length < 8
                  }
                  onClick={() => void generateFeedback()}
                >
                  {generating ? (
                    <Spinner />
                  ) : (
                    <Sparkles className="text-violet-600" />
                  )}
                  {generating ? "Drafting…" : "Draft family update"}
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-[0_10px_30px_rgb(18_37_58/5%)] sm:p-5">
                <label htmlFor="class-notes" className="text-sm font-semibold">
                  Teacher notes{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Record only what happened in class. AI drafts remain editable
                  and never control attendance or credit charging.
                </p>
                <Textarea
                  id="class-notes"
                  value={classNotes}
                  disabled={locked || saving}
                  onChange={(event) => {
                    setClassNotes(event.target.value);
                    setDirty(true);
                    if (feedback) {
                      setFeedback(null);
                      setFeedbackWarning(
                        "The previous draft was cleared because the source note changed.",
                      );
                    }
                  }}
                  className="mt-3 min-h-28 resize-y"
                  maxLength={4_000}
                  placeholder="e.g. Fractions review went well. The class needs more practice with mixed numbers…"
                />
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquareText className="size-3.5" />
                  Obvious email addresses and phone numbers are removed before
                  a configured AI provider is called.
                </div>
              </div>
            </div>

            {feedback && (
              <section
                aria-labelledby="feedback-heading"
                className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/55 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="feedback-heading"
                    className="font-semibold text-[var(--navy-950)]"
                  >
                    Editable family update
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-violet-200 bg-white text-violet-700"
                  >
                    {feedbackSource === "ai"
                      ? "AI draft"
                      : feedbackSource === "fallback"
                        ? "Local fallback"
                        : "Saved draft"}
                  </Badge>
                </div>
                {feedbackWarning && (
                  <p className="mt-2 text-sm text-amber-800">
                    {feedbackWarning}
                  </p>
                )}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="feedback-summary"
                      className="text-sm font-semibold"
                    >
                      Summary
                    </label>
                    <Textarea
                      id="feedback-summary"
                      value={feedback.summary}
                      disabled={locked || saving}
                      maxLength={500}
                      className="mt-1 min-h-20 bg-white"
                      onChange={(event) => {
                        setFeedback((current) =>
                          current
                            ? { ...current, summary: event.target.value }
                            : current,
                        );
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="feedback-strengths"
                      className="text-sm font-semibold"
                    >
                      Strengths{" "}
                      <span className="font-normal text-muted-foreground">
                        (one per line)
                      </span>
                    </label>
                    <Textarea
                      id="feedback-strengths"
                      value={feedback.strengths.join("\n")}
                      disabled={locked || saving}
                      className="mt-1 min-h-24 bg-white"
                      onChange={(event) => {
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                strengths: splitLines(event.target.value),
                              }
                            : current,
                        );
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="feedback-next"
                      className="text-sm font-semibold"
                    >
                      Next steps{" "}
                      <span className="font-normal text-muted-foreground">
                        (one per line)
                      </span>
                    </label>
                    <Textarea
                      id="feedback-next"
                      value={feedback.nextSteps.join("\n")}
                      disabled={locked || saving}
                      className="mt-1 min-h-24 bg-white"
                      onChange={(event) => {
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                nextSteps: splitLines(event.target.value),
                              }
                            : current,
                        );
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="feedback-message"
                      className="text-sm font-semibold"
                    >
                      Message draft
                    </label>
                    <Textarea
                      id="feedback-message"
                      value={feedback.guardianMessageDraft}
                      disabled={locked || saving}
                      maxLength={900}
                      className="mt-1 min-h-28 bg-white"
                      onChange={(event) => {
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                guardianMessageDraft: event.target.value,
                              }
                            : current,
                        );
                        setDirty(true);
                      }}
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  This draft is saved with the class for human review. This
                  slice never sends messages automatically.
                </p>
              </section>
            )}

            <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-border bg-white/95 px-4 py-4 shadow-[0_-10px_30px_rgb(18_37_58/6%)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="mx-auto flex max-w-[1040px] flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {locked ? (
                    <>
                      {completed
                        ? "Attendance and credit entries are locked. Corrections use an admin reversal rather than editing ledger history."
                        : "This class was cancelled and cannot be completed."}
                    </>
                  ) : unmarkedCount > 0 ? (
                    <>
                      <strong className="text-amber-700">{unmarkedCount}</strong>{" "}
                      {unmarkedCount === 1 ? "student remains" : "students remain"}{" "}
                      unmarked.
                    </>
                  ) : potentialPendingCount > 0 ? (
                    <>
                      <strong className="text-amber-700">
                        {potentialPendingCount}
                      </strong>{" "}
                      attendance charge will need admin review; the remaining{" "}
                      <strong className="text-foreground">
                        {billableCount - potentialPendingCount}
                      </strong>{" "}
                      will be recorded.
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground">
                        {billableCount}
                      </strong>{" "}
                      lesson credits will be recorded in the immutable ledger.
                    </>
                  )}
                </p>
                <Button
                  size="lg"
                  className="bg-[var(--navy-900)] px-6 hover:bg-[var(--navy-800)]"
                  disabled={
                    locked ||
                    saving ||
                    generating ||
                    unmarkedCount > 0 ||
                    session.timing === "upcoming"
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  {saving ? <Spinner /> : <Check />}
                  {saving
                    ? "Completing…"
                    : completed
                      ? "Class completed"
                      : cancelled
                        ? "Class cancelled"
                        : unmarkedCount > 0
                          ? `Mark ${unmarkedCount} remaining`
                      : session.timing === "upcoming"
                        ? "Class has not started"
                        : "Complete class"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this class?</AlertDialogTitle>
            <AlertDialogDescription>
              This writes immutable attendance and lesson-credit records. Teacher
              corrections require an audited admin workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <div><span className="text-muted-foreground">Billable present / late</span><strong className="block text-lg">{billableCount}</strong></div>
            <div><span className="text-muted-foreground">Absent</span><strong className="block text-lg">{absentCount}</strong></div>
            <div><span className="text-muted-foreground">Credits charged</span><strong className="block text-lg">{billableCount - potentialPendingCount}</strong></div>
            <div><span className="text-muted-foreground">Admin review</span><strong className="block text-lg text-amber-700">{potentialPendingCount}</strong></div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Review attendance</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void completeVisibleClass();
              }}
            >
              Confirm and complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this class draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Attendance, notes, and feedback changes have not been submitted.
              Stay here to keep editing, or discard them and switch classes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndSwitch}>
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceFrame>
  );
}
