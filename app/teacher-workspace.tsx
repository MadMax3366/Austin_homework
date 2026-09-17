"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarOff,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(input: unknown): unknown | Promise<unknown>;
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
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const error = payload as ApiErrorBody;
    throw new ClientApiError(
      error.error?.code ?? "REQUEST_FAILED",
      error.error?.message ?? "The request failed.",
      response.status,
    );
  }
  return payload as T;
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
    .map((line) => line.trim())
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
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]">
              <BookOpen className="size-[18px]" aria-hidden="true" />
            </span>
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
              className="hidden text-slate-300 hover:bg-white/10 hover:text-white sm:inline-flex"
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [classNotes, setClassNotes] = useState("");
  const [feedback, setFeedback] = useState<FeedbackDraft | null>(null);
  const [feedbackSource, setFeedbackSource] = useState<
    "ai" | "fallback" | null
  >(null);
  const [feedbackWarning, setFeedbackWarning] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef("");

  const applyWorkspace = useCallback((workspace: TeacherWorkspaceData) => {
    setData(workspace);
    setAttendance(
      Object.fromEntries(
        workspace.roster.map((student) => [
          student.id,
          student.attendanceStatus,
        ]),
      ),
    );
    setClassNotes(workspace.rawClassNotes);
    setFeedback(workspace.feedback);
    setFeedbackSource(null);
    setFeedbackWarning(null);
    setActionError(null);
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  const loadWorkspace = useCallback(
    async (sessionId?: string | null) => {
      setLoading(true);
      setLoadError(null);
      try {
        const suffix = sessionId
          ? `?sessionId=${encodeURIComponent(sessionId)}`
          : "";
        const workspace = await requestJson<TeacherWorkspaceData>(
          `/api/workspace${suffix}`,
        );
        applyWorkspace(workspace);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Today’s classes could not be loaded.",
        );
      } finally {
        setLoading(false);
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

  const billableCount = useMemo(
    () =>
      Object.values(attendance).filter((value) => value !== "absent").length,
    [attendance],
  );
  const lowBalanceCount = useMemo(
    () => data?.roster.filter((student) => student.balance <= 3).length ?? 0,
    [data],
  );
  const potentialPendingCount = useMemo(
    () =>
      data?.roster.filter(
        (student) =>
          attendance[student.id] !== "absent" && student.balance < 1,
      ).length ?? 0,
    [attendance, data],
  );

  const performComplete = useCallback(
    async (
      records: { studentId: string; status: AttendanceStatus }[],
      rawClassNotes: string,
      feedbackDraft: FeedbackDraft | null,
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
        await loadWorkspace(session.id);
        return result;
      } catch (error) {
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
    const records = data.roster.map((student) => ({
      studentId: student.id,
      status: attendance[student.id] ?? "present",
    }));
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
    setActionError(null);
    setFeedbackWarning(null);
    try {
      const result = await requestJson<FeedbackDraftResult>(
        "/api/feedback/draft",
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: session.id,
            rawNotes: classNotes,
          }),
        },
      );
      setFeedback(result.draft);
      setFeedbackSource(result.source);
      setFeedbackWarning(result.warning?.message ?? null);
      if (result.source === "fallback") {
        toast.info("AI was unavailable. An editable local draft was created.");
      } else {
        toast.success("Editable family update drafted.");
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "A feedback draft could not be created.",
      );
    } finally {
      setGenerating(false);
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
        },
        required: ["sessionId", "records", "rawClassNotes"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      async execute(input) {
        if (!input || typeof input !== "object") {
          throw new Error("Input must be an object.");
        }
        const candidate = input as {
          sessionId?: unknown;
          records?: unknown;
          rawClassNotes?: unknown;
        };
        if (candidate.sessionId !== session.id) {
          throw new Error("The requested session is not currently visible.");
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
          <Button className="mt-5" onClick={() => void loadWorkspace()}>
            <RefreshCw /> Try again
          </Button>
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
        </div>
      </WorkspaceFrame>
    );
  }

  const session = data.selectedSession;
  const completed = session.status === "completed";

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
              onClick={() => void loadWorkspace(item.id)}
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
                onClick={() => void loadWorkspace(item.id)}
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
                      : session.timing === "active"
                        ? "In progress"
                        : session.timing === "upcoming"
                          ? "Upcoming"
                          : "Ready to finalise"}
                  </Badge>
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
              <Button variant="outline" size="sm" className="w-fit" disabled>
                <MoreHorizontal /> Class details
              </Button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="summary-card">
                <Users />
                <div>
                  <span>Roster</span>
                  <strong>{data.roster.length} students</strong>
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
              <p className="hidden text-sm text-muted-foreground sm:block">
                Present and late students use one lesson credit.
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_10px_30px_rgb(18_37_58/5%)]">
              <div className="hidden grid-cols-[minmax(220px,1fr)_auto_140px] gap-4 border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
                <span>Student</span>
                <span>Attendance</span>
                <span className="text-right">Lesson balance</span>
              </div>
              <div className="divide-y divide-border">
                {data.roster.map((student) => {
                  const status = attendance[student.id] ?? "present";
                  const nextBalance =
                    completed || status === "absent"
                      ? student.balance
                      : Math.max(0, student.balance - 1);
                  const pending =
                    completed
                      ? student.billingStatus ===
                        "pending_insufficient_credit"
                      : status !== "absent" && student.balance < 1;

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
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            Age {student.age}
                          </p>
                        </div>
                      </div>

                      <RadioGroup
                        value={status}
                        disabled={completed || saving}
                        onValueChange={(value) =>
                          setAttendance((current) => ({
                            ...current,
                            [student.id]: value as AttendanceStatus,
                          }))
                        }
                        className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
                        aria-label={`Attendance for ${student.name}`}
                      >
                        {statusOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`rounded-md px-2.5 py-2 text-center text-sm font-medium transition ${
                              completed || saving
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
                            />
                            {option.label}
                          </label>
                        ))}
                      </RadioGroup>

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
                    completed || generating || classNotes.trim().length < 8
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
                  disabled={completed}
                  onChange={(event) => setClassNotes(event.target.value)}
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
                      disabled={completed}
                      className="mt-1 min-h-20 bg-white"
                      onChange={(event) =>
                        setFeedback((current) =>
                          current
                            ? { ...current, summary: event.target.value }
                            : current,
                        )
                      }
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
                      disabled={completed}
                      className="mt-1 min-h-24 bg-white"
                      onChange={(event) =>
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                strengths: splitLines(event.target.value),
                              }
                            : current,
                        )
                      }
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
                      disabled={completed}
                      className="mt-1 min-h-24 bg-white"
                      onChange={(event) =>
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                nextSteps: splitLines(event.target.value),
                              }
                            : current,
                        )
                      }
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
                      disabled={completed}
                      className="mt-1 min-h-28 bg-white"
                      onChange={(event) =>
                        setFeedback((current) =>
                          current
                            ? {
                                ...current,
                                guardianMessageDraft: event.target.value,
                              }
                            : current,
                        )
                      }
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
                  {completed ? (
                    <>
                      Attendance and credit entries are locked. Corrections use
                      an admin reversal rather than editing ledger history.
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
                  disabled={completed || saving || session.timing === "upcoming"}
                  onClick={() => void completeVisibleClass()}
                >
                  {saving ? <Spinner /> : <Check />}
                  {saving
                    ? "Completing…"
                    : completed
                      ? "Class completed"
                      : session.timing === "upcoming"
                        ? "Class has not started"
                        : "Complete class"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceFrame>
  );
}
