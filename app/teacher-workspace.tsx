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
  RefreshCw,
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
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { WeekCalendar } from "@/components/week-calendar";
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
  { value: "present", label: "出勤" },
  { value: "late", label: "迟到" },
  { value: "absent", label: "缺席" },
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
          "服务器返回了无法读取的数据。",
          response.status,
        );
      }
    }
    if (!response.ok) {
      const error = payload as ApiErrorBody | null;
      throw new ClientApiError(
        error?.error?.code ?? "REQUEST_FAILED",
        error?.error?.message ?? "请求失败。",
        response.status,
      );
    }
    if (!payload) {
      throw new ClientApiError(
        "EMPTY_SERVER_RESPONSE",
        "服务器返回了空数据。",
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
          ? "请求超时，当前内容已保留。"
          : "请求已取消。",
        0,
      );
    }
    throw new ClientApiError(
      "NETWORK_UNAVAILABLE",
      "网络不可用，当前内容已保留。",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function displayTime(value: string): string {
  return value.slice(0, 5);
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
        <p className="sr-only" role="status">正在加载课程…</p>
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
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]">
              <BookOpen className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight">
                Austin Education
              </p>
              <p className="truncate text-xs text-slate-300">
                教师工作台
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-medium">
                {viewer.displayName}
              </p>
              <p className="text-xs text-slate-300">{viewer.email}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold">
              {initials(viewer.displayName)}
            </span>
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" aria-label="退出登录"><LogOut /></Button>
            </form>
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
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
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
            : "课程加载失败。",
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
          attendance[student.id] !== null && attendance[student.id] !== undefined,
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
      if (!session) throw new Error("尚未选择课程。");
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
            `课程已完成，${result.pendingCreditCount} 条课时记录等待运营处理。`,
          );
        } else {
          toast.success(
            result.idempotentReplay
              ? "课程已完成，未重复扣除课时。"
              : `课程已完成，已记录 ${result.chargedCount} 条课时。`,
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
              "课程已在服务器完成保存。",
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
          error instanceof Error ? error.message : "课程保存失败。";
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
        `请先完成所有学生的点名（剩余 ${unmarkedCount} 人）。`,
      );
      setConfirmOpen(false);
      return;
    }
    if (
      feedback &&
      (!feedback.summary.trim() || !feedback.guardianMessageDraft.trim())
    ) {
      setActionError("课堂小结和家长消息不能为空。");
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
        "请先填写课堂记录。",
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
        toast.info("已生成可编辑草稿。");
      } else {
        toast.success("家长反馈草稿已生成。");
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
          : "反馈草稿生成失败。",
      );
    } finally {
      if (intentSessionId.current === requestedSessionId) {
        setGenerating(false);
      }
    }
  }

  async function submitLeaveRequest() {
    if (!leaveStart || !leaveEnd || leaveReason.trim().length < 2 || leaveBusy) return;
    setLeaveBusy(true);
    try {
      const result = await requestJson<{ message: string }>(
        "/api/platform/commands?role=teacher",
        {
          method: "POST",
          body: JSON.stringify({
            action: "request_teacher_leave",
            startsOn: leaveStart,
            endsOn: leaveEnd,
            reason: leaveReason,
          }),
        },
      );
      toast.success(result.message);
      setLeaveReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "请假申请提交失败。");
    } finally {
      setLeaveBusy(false);
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
            <AlertTitle>教师工作台加载失败</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
          {loadErrorCode === "AUTH_REQUIRED" ? (
            <Button className="mt-5" onClick={() => window.location.assign("/")}>重新登录</Button>
          ) : (
            <Button className="mt-5" onClick={() => void loadWorkspace()}><RefreshCw />重试</Button>
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
              <EmptyTitle>本周没有课程</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void loadWorkspace()}>
                <RefreshCw />刷新
              </Button>
            </EmptyContent>
          </Empty>
          {data ? (
            <div className="mt-5 rounded-2xl border border-border bg-white p-6">
              <p className="text-sm font-semibold text-muted-foreground">本期薪资</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--navy-950)]">
                {displayMoney(data.payroll.currentAmountCents)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.payroll.currentPeriod?.status === "paid" ? "已支付" : data.payroll.currentPeriod?.status === "approved" ? "已审批" : data.payroll.currentPeriod ? "待审批" : "暂无薪资周期"} · {data.payroll.recentEntries.length} 条记录
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
          aria-label="本周课程"
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
            本周课程
          </p>
          <nav className="mt-4 space-y-2" aria-label="本周课程">
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
                      aria-label="已完成"
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
                  {item.room} · {item.rosterCount} 人
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1040px]">
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-[var(--navy-950)]">本周课表</h2>
              <WeekCalendar
                anchorDate={data.today}
                events={data.sessions.map((item) => ({
                  id: item.id,
                  date: item.date,
                  startTime: item.startTime,
                  endTime: item.endTime,
                  title: item.title,
                  room: item.room,
                  status: item.status,
                  kind: item.kind,
                  participants: item.rosterCount,
                }))}
              />
              <details className="mt-3 rounded-xl border bg-white p-4">
                <summary className="cursor-pointer font-medium">提交请假申请</summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium"><span>开始日期</span><input className="block h-10 w-full rounded-md border px-3 font-normal" type="date" value={leaveStart} onChange={(event) => setLeaveStart(event.target.value)} /></label>
                  <label className="space-y-2 text-sm font-medium"><span>结束日期</span><input className="block h-10 w-full rounded-md border px-3 font-normal" type="date" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} /></label>
                  <label className="space-y-2 text-sm font-medium sm:col-span-2"><span>请假原因</span><Textarea value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} maxLength={1000} /></label>
                  <Button className="sm:col-span-2" disabled={leaveBusy || !leaveStart || !leaveEnd || leaveReason.trim().length < 2} onClick={() => void submitLeaveRequest()}>{leaveBusy ? <Spinner /> : null}提交申请</Button>
                </div>
              </details>
            </div>
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
                      ? "已完成"
                      : cancelled
                        ? "已取消"
                      : session.timing === "active"
                        ? "进行中"
                        : session.timing === "upcoming"
                          ? "待上课"
                          : "待完成"}
                  </Badge>
                  <Badge variant="outline">{session.kind === "regular" ? "正式课" : session.kind === "trial" ? "试听课" : session.kind === "makeup" ? "补课" : "一对一"}</Badge>
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
                  <span>墨尔本时间</span>
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="summary-card">
                <Users />
                <div>
                  <span>学生名单</span>
                  <strong>{data.roster.length} 人</strong>
                </div>
              </div>
              <div className="summary-card">
                <WalletCards />
                <div>
                  <span>本期薪资</span>
                  <strong>{displayMoney(data.payroll.currentAmountCents)}</strong>
                </div>
              </div>
              <div className="summary-card">
                <Coins />
                <div>
                  <span>{completed ? "已扣课时" : "预计扣课时"}</span>
                  <strong>
                    {completed
                      ? data.roster.filter(
                          (student) => student.billingStatus === "charged",
                        ).length
                      : billableCount}{" "}
                    人
                  </strong>
                </div>
              </div>
              <div className="summary-card">
                <AlertCircle />
                <div>
                  <span>低课时</span>
                  <strong>{lowBalanceCount} 人</strong>
                </div>
              </div>
            </div>

            {lowBalanceCount > 0 && !completed && (
              <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-950">
                <AlertCircle />
                <AlertTitle>{lowBalanceCount} 名学生课时不足</AlertTitle>
              </Alert>
            )}

            {completed &&
              data.roster.some(
                (student) =>
                  student.billingStatus === "pending_insufficient_credit",
              ) && (
                <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-950">
                  <AlertCircle />
                  <AlertTitle>存在待处理的课时记录</AlertTitle>
                </Alert>
              )}

            {actionError && (
              <Alert variant="destructive" className="mt-5">
                <AlertCircle />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="section-kicker">课堂点名</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--navy-950)]">
                  出勤记录
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
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
                    <Check />全部出勤
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_10px_30px_rgb(18_37_58/5%)]">
              <div className="hidden grid-cols-[minmax(220px,1fr)_auto_140px] gap-4 border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
                <span>学生</span>
                <span>出勤</span>
                <span className="text-right">剩余课时</span>
              </div>
              <div className="divide-y divide-border">
                {data.roster.map((student) => {
                  const status = attendance[student.id] ?? null;
                  const nextBalance =
                    locked ||
                    status === null ||
                    student.billingPolicy === "trial_free"
                      ? student.balance
                      : Math.max(0, student.balance - 1);
                  const pending =
                    locked
                      ? student.billingStatus ===
                        "pending_insufficient_credit"
                      : status !== null &&
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
                                新生
                              </Badge>
                            )}
                            {student.billingPolicy === "trial_free" && (
                              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">试听</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {student.age} 岁
                          </p>
                        </div>
                      </div>

                      <div>
                        {status === null && (
                          <p className="mb-1 text-xs font-medium text-amber-700">
                            未点名
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
                        aria-label={`${student.name}的出勤状态`}
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
                          剩余课时
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
                              课时
                            </span>
                          </p>
                          {pending && (
                            <p className="mt-0.5 text-xs font-medium text-amber-700">
                              待运营处理
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
              <p className="section-kicker">课堂记录</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--navy-950)]">
                  课堂反馈
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
                  {generating ? "正在生成…" : "生成家长反馈"}
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-[0_10px_30px_rgb(18_37_58/5%)] sm:p-5">
                <label htmlFor="class-notes" className="text-sm font-semibold">
                  课堂记录{" "}
                  <span className="font-normal text-muted-foreground">
                    （选填）
                  </span>
                </label>
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
                        "课堂记录已修改，请重新生成反馈。",
                      );
                    }
                  }}
                  className="mt-3 min-h-28 resize-y"
                  maxLength={4_000}
                  placeholder="记录本节课的学习内容、课堂表现和后续建议"
                />
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
                    家长反馈草稿
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-violet-200 bg-white text-violet-700"
                  >
                    {feedbackSource === "ai"
                      ? "智能草稿"
                      : feedbackSource === "fallback"
                        ? "本地草稿"
                        : "已保存"}
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
                      课堂小结
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
                      课堂亮点{" "}
                      <span className="font-normal text-muted-foreground">
                        （每行一条）
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
                      后续建议{" "}
                      <span className="font-normal text-muted-foreground">
                        （每行一条）
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
                      家长消息
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
              </section>
            )}

            <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-border bg-white/95 px-4 py-4 shadow-[0_-10px_30px_rgb(18_37_58/6%)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="mx-auto flex max-w-[1040px] flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {locked ? (
                    <>
                      {completed
                        ? "本课次已完成"
                        : "本课次已取消"}
                    </>
                  ) : unmarkedCount > 0 ? (
                    <>
                      <strong className="text-amber-700">{unmarkedCount}</strong>{" "}
                      人尚未点名
                    </>
                  ) : potentialPendingCount > 0 ? (
                    <>
                      <strong className="text-amber-700">
                        {potentialPendingCount}
                      </strong>{" "}
                      人需要运营处理；其余{" "}
                      <strong className="text-foreground">
                        {billableCount - potentialPendingCount}
                      </strong>{" "}
                      人将正常扣课时
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground">
                        {billableCount}
                      </strong>{" "}
                      人将扣除课时
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
                    ? "正在完成…"
                    : completed
                      ? "课程已完成"
                      : cancelled
                        ? "课程已取消"
                        : unmarkedCount > 0
                          ? `还有 ${unmarkedCount} 人未点名`
                      : session.timing === "upcoming"
                        ? "课程尚未开始"
                        : "完成课程"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认完成课程？</AlertDialogTitle>
            <AlertDialogDescription>请确认出勤记录和课堂反馈无误。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <div><span className="text-muted-foreground">出勤／迟到</span><strong className="block text-lg">{billableCount}</strong></div>
            <div><span className="text-muted-foreground">缺席</span><strong className="block text-lg">{absentCount}</strong></div>
            <div><span className="text-muted-foreground">正常扣课时</span><strong className="block text-lg">{billableCount - potentialPendingCount}</strong></div>
            <div><span className="text-muted-foreground">待运营处理</span><strong className="block text-lg text-amber-700">{potentialPendingCount}</strong></div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>返回检查</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void completeVisibleClass();
              }}
            >
              确认完成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃当前修改？</AlertDialogTitle>
            <AlertDialogDescription>未保存的点名和课堂反馈将会丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndSwitch}>
              放弃并切换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceFrame>
  );
}
