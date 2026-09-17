"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  LogOut,
  MessageCircleQuestion,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import type { PlatformRole } from "@/lib/account-auth";
import type { PlatformCommandInput } from "@/lib/domain";
import type { PlatformCommandResult } from "@/lib/platform-commands";
import type { OverviewSection, PlatformOverview } from "@/lib/platform-overview";
import type { FaqTriageResult } from "@/lib/types";

type Viewer = { displayName: string; email: string; signOutPath: string };
type Row = Record<string, string | number | null>;

const roleLabels: Record<PlatformRole, string> = {
  teacher: "教师",
  operations_admin: "运营",
  manager_admin: "主管",
  student: "学生",
  guardian: "家长",
  system_admin: "系统管理员",
};

class ClientApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as T | { error?: { code?: string; message?: string } }) : null;
    if (!response.ok) {
      const body = payload as { error?: { code?: string; message?: string } } | null;
      throw new ClientApiError(body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "请求失败。");
    }
    if (!payload) throw new ClientApiError("EMPTY_RESPONSE", "服务器返回了空响应。");
    return payload as T;
  } catch (error) {
    if (error instanceof ClientApiError) throw error;
    if (controller.signal.aborted) throw new ClientApiError("REQUEST_TIMEOUT", "请求超时，请确认结果后再重试。");
    throw new ClientApiError("NETWORK_UNAVAILABLE", "网络暂时不可用。");
  } finally {
    window.clearTimeout(timeout);
  }
}

function displayKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function displayValue(key: string, value: string | number | null): React.ReactNode {
  if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
  if (/amountCents$/i.test(key) && typeof value === "number") {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
  }
  if (key === "status" || key === "kind" || key === "type" || key === "mode") {
    return <Badge variant="outline" className="font-normal">{String(value).replaceAll("_", " ")}</Badge>;
  }
  if (/At$/.test(key) && typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) {
      return (
        <span title={`${value} · stored UTC`} className="text-nowrap">
          {new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Melbourne",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date)}
        </span>
      );
    }
  }
  const text = String(value);
  return <span title={text} className="block max-w-72 truncate">{text}</span>;
}

function DataTable({ rows }: { rows: Row[] }) {
  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
    }
    return keys.slice(0, 9);
  }, [rows]);
  if (!rows.length) {
    return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">当前没有记录。</div>;
  }
  return (
    <div className="rounded-xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow>{columns.map((column) => <TableHead key={column}>{displayKey(column)}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={String(row.id ?? index)}>
              {columns.map((column) => <TableCell key={column}>{displayValue(column, row[column] ?? null)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StudentDirectoryControls({
  section,
  query,
  ownedStudents,
  organizationStudents,
  onQueryChange,
  onSearch,
  onPageChange,
}: {
  section: OverviewSection;
  query: string;
  ownedStudents: number;
  organizationStudents: number;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onPageChange: (page: number) => void;
}) {
  const page = section.page ?? 1;
  const pageSize = section.pageSize ?? 25;
  const total = section.totalRows ?? section.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mb-4 space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span><strong>{ownedStudents.toLocaleString("en-AU")}</strong> 名下学生</span>
        <span><strong>{organizationStudents.toLocaleString("en-AU")}</strong> 全机构学生</span>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(query);
        }}
      >
        <Input
          aria-label="搜索学生"
          maxLength={80}
          placeholder="按学生姓名、ID 或负责人搜索"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Button type="submit">搜索</Button>
        <Button
          type="button"
          variant="outline"
          disabled={!query}
          onClick={() => {
            onQueryChange("");
            onSearch("");
          }}
        >
          清除
        </Button>
      </form>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>匹配 {total.toLocaleString("en-AU")} 人 · 第 {page} / {pageCount} 页</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function OperationsActions({ data, run, busy }: {
  data: PlatformOverview;
  run: (command: PlatformCommandInput) => Promise<void>;
  busy: boolean;
}) {
  const inquiryRows = data.sections.find((section) => section.id === "inquiries")?.rows ?? [];
  const trialRows = data.sections.find((section) => section.id === "trials")?.rows ?? [];
  const trialAttentionRows = data.sections.find((section) => section.id === "trial-attention")?.rows ?? [];
  const lowBalanceRows = data.sections.find((section) => section.id === "low-balances")?.rows ?? [];
  const taskRows = data.sections.find((section) => section.id === "tasks")?.rows ?? [];
  const resources = data.sections.find((section) => section.id === "resources")?.rows ?? [];
  const teacher = resources.find((row) => row.type === "teacher");
  const room = resources.find((row) => row.type === "room");
  const targetClass = resources.find((row) => row.type === "class");
  const [mode, setMode] = useState("create");
  const [studentName, setStudentName] = useState("Avery Demo");
  const [birthDate, setBirthDate] = useState("2015-04-12");
  const [guardianName, setGuardianName] = useState("Morgan Demo");
  const [guardianEmail, setGuardianEmail] = useState("morgan.demo@example.test");
  const [guardianPhone, setGuardianPhone] = useState("0400 000 088");
  const [source, setSource] = useState("Website");
  const [inquiryId, setInquiryId] = useState(String(inquiryRows.find((row) => row.status === "new")?.id ?? inquiryRows[0]?.id ?? ""));
  const [teacherId, setTeacherId] = useState(String(teacher?.id ?? ""));
  const [roomName, setRoomName] = useState(String(room?.name ?? ""));
  const [trialDate, setTrialDate] = useState("");
  const [trialBookingId, setTrialBookingId] = useState(String(trialRows.find((row) => row.outcome === "pending" && row.sessionStatus === "completed")?.id ?? trialRows[0]?.id ?? ""));
  const [conversionInquiryId, setConversionInquiryId] = useState(String(inquiryRows.find((row) => row.status === "trial_completed")?.id ?? ""));
  const [classSeriesId, setClassSeriesId] = useState(String(targetClass?.id ?? ""));
  const [renewalStudentId, setRenewalStudentId] = useState(String(lowBalanceRows[0]?.studentId ?? ""));
  const [renewalCredits, setRenewalCredits] = useState("8");
  const [renewalAmount, setRenewalAmount] = useState("480");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "create") {
      await run({ action: "create_inquiry", studentName, birthDate, guardianName, guardianEmail, guardianPhone, source, notes: "Created from operations workspace" });
    } else if (mode === "trial") {
      await run({ action: "schedule_trial", inquiryId, teacherId, room: roomName, date: trialDate, startTime: "12:00", endTime: "13:00" });
    } else if (mode === "outcome") {
      await run({ action: "record_trial_outcome", trialBookingId, outcome: "attended", decision: "enrol", notes: "Trial attended; family would like to enrol" });
    } else if (mode === "convert") {
      await run({ action: "convert_inquiry", inquiryId: conversionInquiryId, classSeriesId, creditQuantity: 8, amountCents: 48000 });
    } else {
      await run({
        action: "create_order",
        studentId: renewalStudentId,
        creditQuantity: Number(renewalCredits),
        amountCents: Math.round(Number(renewalAmount) * 100),
        description: `${renewalCredits} lesson renewal prepared by operations`,
      });
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>运营动作</CardTitle>
        <CardDescription>写操作同时执行对象授权、状态机和冲突检查。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button type="button" variant={mode === "create" ? "default" : "ghost"} size="sm" onClick={() => setMode("create")}>新咨询</Button>
          <Button type="button" variant={mode === "trial" ? "default" : "ghost"} size="sm" onClick={() => setMode("trial")}>排试听</Button>
          <Button type="button" variant={mode === "outcome" ? "default" : "ghost"} size="sm" onClick={() => setMode("outcome")}>试听结果</Button>
          <Button type="button" variant={mode === "convert" ? "default" : "ghost"} size="sm" onClick={() => setMode("convert")}>转正式</Button>
          <Button type="button" variant={mode === "renewal" ? "default" : "ghost"} size="sm" className="col-span-2" onClick={() => setMode("renewal")}>低课时续费</Button>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {mode === "create" ? (
            <>
              <Field label="学生姓名" value={studentName} onChange={setStudentName} />
              <Field label="出生日期" value={birthDate} onChange={setBirthDate} type="date" />
              <Field label="监护人" value={guardianName} onChange={setGuardianName} />
              <Field label="邮箱" value={guardianEmail} onChange={setGuardianEmail} type="email" />
              <Field label="电话" value={guardianPhone} onChange={setGuardianPhone} />
              <Field label="来源" value={source} onChange={setSource} />
            </>
          ) : mode === "trial" ? (
            <>
              <Field label="咨询 ID" value={inquiryId} onChange={setInquiryId} />
              <Field label="老师 ID" value={teacherId} onChange={setTeacherId} />
              <Field label="教室" value={roomName} onChange={setRoomName} />
              <Field label="日期" value={trialDate} onChange={setTrialDate} type="date" />
            </>
          ) : mode === "outcome" ? (
            <>
              <Field label="试听 Booking ID" value={trialBookingId} onChange={setTrialBookingId} />
              <p className="text-xs leading-5 text-muted-foreground">出勤必须先由老师完成；这里记录招生结论，不代替课堂点名。</p>
            </>
          ) : mode === "convert" ? (
            <>
              <Field label="已完成试听的咨询 ID" value={conversionInquiryId} onChange={setConversionInquiryId} />
              <Field label="目标班级 ID" value={classSeriesId} onChange={setClassSeriesId} />
              <p className="text-xs leading-5 text-muted-foreground">转化会原子创建报名和首期待付订单。</p>
            </>
          ) : (
            <>
              <Field label="低课时学生 ID" value={renewalStudentId} onChange={setRenewalStudentId} />
              <Field label="续费课时" value={renewalCredits} onChange={setRenewalCredits} type="number" />
              <Field label="金额（AUD）" value={renewalAmount} onChange={setRenewalAmount} type="number" />
              <p className="text-xs leading-5 text-muted-foreground">运营只代建待支付订单，不会替家长自动扣款。</p>
            </>
          )}
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? <RefreshCw className="animate-spin" /> : <Play />}
            {mode === "create" ? "创建咨询与跟进" : mode === "trial" ? "校验冲突并排课" : mode === "outcome" ? "记录试听结果" : mode === "convert" ? "转化并创建订单" : "创建待支付续费订单"}
          </Button>
        </form>
        {trialAttentionRows.find((row) => row.queueType === "trial_follow_up") || taskRows[0] ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => {
              const task = trialAttentionRows.find((row) => row.queueType === "trial_follow_up") ?? taskRows[0];
              if (task) void run({ action: "complete_follow_up", taskId: String(task.id), note: "Trial follow-up completed from operations action centre" });
            }}
          >
            <CheckCircle2 />完成最早试听跟进
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ManagerActions({ data, run, busy }: {
  data: PlatformOverview;
  run: (command: PlatformCommandInput) => Promise<void>;
  busy: boolean;
}) {
  const refund = data.sections.find((section) => section.id === "refunds")?.rows.find((row) => row.status === "requested");
  const period = data.sections.find((section) => section.id === "payroll-periods")?.rows[0];
  const support = data.sections.find((section) => section.id === "support")?.rows.find((row) => row.status === "requested");
  return (
    <Card>
      <CardHeader><CardTitle>审批队列</CardTitle><CardDescription>高风险动作要求独立角色，并保留不可变审计。</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full justify-start" disabled={busy || !refund} onClick={() => refund && run({ action: "approve_refund", refundId: String(refund.id), approve: true, note: "Reviewed: unused package may be refunded" })}>
          <WalletCards />批准首条待处理退款
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled={busy || !period || period.status === "paid"} onClick={() => period && run({ action: period.status === "open" ? "approve_payroll_period" : "mark_payroll_paid", payrollPeriodId: String(period.id) })}>
          <CheckCircle2 />{period?.status === "open" ? "审批当前薪资周期" : "标记薪资已支付"}
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled={busy || !support} onClick={() => support && run({ action: "approve_support_session", supportSessionId: String(support.id), minutes: 30 })}>
          <ShieldAlert />批准独立的限时支持
        </Button>
        {!support ? <p className="text-xs leading-5 text-muted-foreground">没有待审批的技术支持申请。系统管理员不能审批自己的申请。</p> : null}
      </CardContent>
    </Card>
  );
}

function PortalActions({ data, run, busy, role }: {
  data: PlatformOverview;
  run: (command: PlatformCommandInput) => Promise<void>;
  busy: boolean;
  role: "student" | "guardian";
}) {
  const studentId = data.context?.studentId ?? "";
  const pending = data.sections.find((section) => section.id === "credits")?.rows.find((row) => row.status === "pending");
  const [credits, setCredits] = useState("4");
  const [amount, setAmount] = useState("240");
  const [question, setQuestion] = useState("");
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqResult, setFaqResult] = useState<FaqTriageResult | null>(null);

  const askFaq = async () => {
    if (faqBusy || question.trim().length < 3) return;
    setFaqBusy(true);
    setFaqResult(null);
    try {
      const result = await requestJson<FaqTriageResult>(
        `/api/faq/triage?role=${encodeURIComponent(role)}`,
        {
          method: "POST",
          body: JSON.stringify({ question, studentId }),
        },
      );
      setFaqResult(result);
      if (result.status === "escalated") toast.info(result.message);
    } catch (caught) {
      const next = caught instanceof ClientApiError
        ? caught
        : new ClientApiError("FAQ_FAILED", "问题暂时无法处理。");
      toast.error(`${next.message} (${next.code})`);
    } finally {
      setFaqBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>课时与续费</CardTitle><CardDescription>付款成功后才增加课时；重复回调不会重复入账。</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="购买课时" value={credits} onChange={setCredits} type="number" />
          <Field label="金额（AUD）" value={amount} onChange={setAmount} type="number" />
          <Button className="w-full" disabled={busy || !studentId} onClick={() => run({ action: "create_order", studentId, creditQuantity: Number(credits), amountCents: Math.round(Number(amount) * 100), description: `${credits} lesson renewal package` })}>
            <WalletCards />创建续费订单
          </Button>
          <Button variant="outline" className="w-full" disabled={busy || !pending} onClick={() => pending && run({ action: "sandbox_pay_order", orderId: String(pending.id), providerEventId: `portal_${crypto.randomUUID().replaceAll("-", "")}` })}>
            <Send />沙盒支付最早待付订单
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>FAQ 智能分流</CardTitle>
          <CardDescription>只回答机构批准的基础 FAQ；涉及个人课表、退款、支付争议或安全问题会直接转人工。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="faq-question">你的问题</Label>
            <Textarea
              id="faq-question"
              value={question}
              maxLength={1_000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：正式课出勤后课时怎么扣？"
            />
          </div>
          <Button
            className="w-full"
            disabled={faqBusy || question.trim().length < 3}
            onClick={() => void askFaq()}
          >
            {faqBusy ? <RefreshCw className="animate-spin" /> : <MessageCircleQuestion />}
            {faqBusy ? "判断中…" : "查询 FAQ 或转人工"}
          </Button>
          {faqResult ? (
            <Alert className={faqResult.status === "escalated" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
              <MessageCircleQuestion />
              <AlertTitle>{faqResult.status === "answered" ? "FAQ 回答" : "已转人工"}</AlertTitle>
              <AlertDescription>
                {faqResult.answer ?? faqResult.message}
                {faqResult.ticketId ? <span className="mt-1 block text-xs">跟进任务：{faqResult.ticketId}</span> : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SystemActions({ run, busy }: {
  run: (command: PlatformCommandInput) => Promise<void>;
  busy: boolean;
}) {
  const [reason, setReason] = useState("Investigate failed background delivery without exposing unmasked business data");
  return (
    <Card>
      <CardHeader><CardTitle>技术操作</CardTitle><CardDescription>默认只有诊断与技术队列权限；业务写入不随系统角色自动开放。</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" disabled={busy} onClick={() => run({ action: "process_outbox", limit: 20 })}>
          <RefreshCw />运行一次沙盒 outbox worker
        </Button>
        <div className="space-y-2"><Label>紧急支持原因</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => run({ action: "request_support_session", reason, scope: ["diagnostics.read", "jobs.retry", "business.masked_read"], minutes: 30 })}>
          <ShieldAlert />申请 30 分钟限时支持
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlatformWorkspace({ role, viewer, availableRoles }: {
  role: Exclude<PlatformRole, "teacher">;
  viewer: Viewer;
  availableRoles: PlatformRole[];
}) {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<string>();
  const [studentSearch, setStudentSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ role });
      const locationSearch = new URLSearchParams(window.location.search);
      const selectedStudent = locationSearch.get("studentId");
      if (selectedStudent) query.set("studentId", selectedStudent);
      const studentQuery = locationSearch.get("studentQuery");
      const studentPage = locationSearch.get("studentPage");
      if (studentQuery) query.set("studentQuery", studentQuery);
      if (studentPage) query.set("studentPage", studentPage);
      const nextData = await requestJson<PlatformOverview>(`/api/platform/overview?${query}`);
      setData(nextData);
      if (role === "operations_admin") {
        setStudentSearch(nextData.context?.studentQuery ?? "");
      }
    } catch (caught) {
      const next = caught instanceof ClientApiError ? caught : new ClientApiError("LOAD_FAILED", "工作台加载失败。");
      setError({ code: next.code, message: next.message });
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const run = useCallback(async (command: PlatformCommandInput) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestJson<PlatformCommandResult>(`/api/platform/commands?role=${encodeURIComponent(role)}`, {
        method: "POST",
        body: JSON.stringify(command),
      });
      toast.success(result.message);
      await load();
    } catch (caught) {
      const next = caught instanceof ClientApiError ? caught : new ClientApiError("ACTION_FAILED", "操作失败。");
      toast.error(`${next.message} (${next.code})`);
    } finally {
      setBusy(false);
    }
  }, [busy, load, role]);

  const switchGuardianStudent = (studentId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("studentId", studentId);
    window.history.replaceState({}, "", url);
    void load();
  };

  const updateStudentDirectory = (queryValue: string, page: number) => {
    const url = new URL(window.location.href);
    const normalized = queryValue.trim();
    if (normalized) url.searchParams.set("studentQuery", normalized);
    else url.searchParams.delete("studentQuery");
    if (page > 1) url.searchParams.set("studentPage", String(page));
    else url.searchParams.delete("studentPage");
    window.history.replaceState({}, "", url);
    setActiveSection("students");
    void load();
  };

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-[var(--navy-800)] bg-[var(--navy-950)] text-white">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="grid size-9 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]" aria-label="Role launcher"><BookOpen className="size-[18px]" /></Link>
          <div><p className="text-sm font-semibold">Austin Education</p><p className="text-xs text-slate-300">{roleLabels[role]}工作台</p></div>
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Switch workspace">
            {availableRoles.map((item) => <Link key={item} href={`/workspace/${item}`} className={`rounded-md px-3 py-2 text-xs ${item === role ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10"}`}>{roleLabels[item]}</Link>)}
          </nav>
          <div className="ml-auto hidden text-right sm:block lg:ml-3"><p className="max-w-40 truncate text-sm font-medium">{viewer.displayName}</p><p className="text-xs text-slate-300">{roleLabels[role]}</p></div>
          <Button asChild variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white"><a href={viewer.signOutPath} target="_top" aria-label="Sign out"><LogOut /></a></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid gap-3 sm:grid-cols-4">{[0,1,2,3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}</div><Skeleton className="h-96 rounded-2xl" /></div>
        ) : error ? (
          <Alert variant="destructive"><AlertCircle /><AlertTitle>{error.code}</AlertTitle><AlertDescription>{error.message}<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>重试</Button></AlertDescription></Alert>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-sm font-semibold text-[var(--cyan-700)]">{roleLabels[role]} · Live workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[var(--navy-950)]">{data.title}</h1></div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}><RefreshCw className={busy ? "animate-spin" : ""} />刷新</Button>
            </div>
            {role === "system_admin" ? <Alert className="mt-5"><ShieldAlert /><AlertTitle>系统权限不是业务超级管理员</AlertTitle><AlertDescription>默认仅显示技术状态和脱敏审计。临时支持需要独立主管审批、限定 scope、自动过期。</AlertDescription></Alert> : null}
            {role === "guardian" ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                <span className="mr-1 text-sm font-medium">切换关联学生</span>
                {(data.sections.find((section) => section.id === "family")?.rows ?? []).map((student) => (
                  <Button
                    key={String(student.id)}
                    size="sm"
                    variant={String(student.id) === data.context?.studentId ? "default" : "outline"}
                    onClick={() => switchGuardianStudent(String(student.id))}
                  >
                    {String(student.student)}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.metrics.map((metric) => <Card key={metric.label} className={metric.tone === "warning" ? "border-amber-300 bg-amber-50/60" : metric.tone === "positive" ? "border-emerald-300 bg-emerald-50/60" : "bg-white"}><CardHeader className="pb-0"><CardDescription>{metric.label}</CardDescription><CardTitle className="text-2xl">{metric.value}</CardTitle></CardHeader></Card>)}
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Tabs value={activeSection ?? data.sections[0]?.id} onValueChange={setActiveSection} className="min-w-0">
                <div className="overflow-x-auto pb-2"><TabsList variant="line">{data.sections.map((section) => <TabsTrigger key={section.id} value={section.id}>{section.title}<Badge variant="secondary">{section.totalRows ?? section.rows.length}</Badge></TabsTrigger>)}</TabsList></div>
                {data.sections.map((section) => (
                  <TabsContent key={section.id} value={section.id} className="mt-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-[var(--navy-950)]">{section.title}</h2>
                      <span className="text-xs text-muted-foreground">
                        {section.totalRows === undefined
                          ? `实时查询 · 当前 ${section.rows.length} 条`
                          : `显示 ${section.rows.length} / 共 ${section.totalRows.toLocaleString("en-AU")} 条`}
                      </span>
                    </div>
                    {role === "operations_admin" && section.id === "students" ? (
                      <StudentDirectoryControls
                        section={section}
                        query={studentSearch}
                        ownedStudents={data.context?.ownedStudentCount ?? 0}
                        organizationStudents={data.context?.organizationStudentCount ?? 0}
                        onQueryChange={setStudentSearch}
                        onSearch={(value) => updateStudentDirectory(value, 1)}
                        onPageChange={(page) => updateStudentDirectory(studentSearch, page)}
                      />
                    ) : null}
                    <DataTable rows={section.rows} />
                  </TabsContent>
                ))}
              </Tabs>
              <aside>
                {role === "operations_admin" ? (
                  <OperationsActions
                    key={JSON.stringify(data.sections.filter((section) => ["inquiries", "trials", "trial-attention", "low-balances"].includes(section.id)).map((section) => section.rows.map((row) => [row.id, row.status, row.outcome, row.decision, row.credits])))}
                    data={data}
                    run={run}
                    busy={busy}
                  />
                ) : null}
                {role === "manager_admin" ? <ManagerActions data={data} run={run} busy={busy} /> : null}
                {role === "student" || role === "guardian" ? <PortalActions data={data} run={run} busy={busy} role={role} /> : null}
                {role === "system_admin" ? <SystemActions run={run} busy={busy} /> : null}
                <Link href="/" className="mt-4 flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-medium text-[var(--navy-900)] hover:bg-muted"><ArrowLeftRight className="size-4" />切换职责</Link>
              </aside>
            </div>
          </>
        ) : null}
      </div>
      <Toaster position="bottom-center" />
    </main>
  );
}
