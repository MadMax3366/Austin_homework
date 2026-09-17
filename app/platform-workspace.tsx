"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Eye,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WeekCalendar, type WeekCalendarEvent } from "@/components/week-calendar";
import type { PlatformRole } from "@/lib/account-auth";
import type { PlatformCommandInput } from "@/lib/domain";
import type { PlatformCommandResult } from "@/lib/platform-commands";
import type { OverviewSection, PlatformOverview } from "@/lib/platform-overview";
import type { FaqTriageResult } from "@/lib/types";
import type { StudentDetail } from "@/lib/student-detail";

type Viewer = { displayName: string; email: string };
type Row = Record<string, string | number | null>;

const roleLabels: Record<PlatformRole, string> = {
  teacher: "教师",
  operations_admin: "运营",
  manager_admin: "主管",
  student: "学生",
  guardian: "家长",
  system_admin: "系统管理",
};

const fieldLabels: Record<string, string> = {
  student: "学生",
  legalName: "姓名",
  preferredName: "常用名",
  dateOfBirth: "出生日期",
  status: "状态",
  owner: "负责人",
  credits: "剩余课时",
  risk: "续费状态",
  source: "来源",
  nextFollowUpAt: "下次跟进",
  queueType: "事项",
  outcome: "试听结果",
  decision: "报名意向",
  trialDate: "试听日期",
  dueAt: "截止时间",
  sessionDate: "上课日期",
  startTime: "开始",
  endTime: "结束",
  className: "班级",
  subject: "科目",
  teacher: "老师",
  room: "教室",
  participants: "人数",
  sessionStatus: "课程状态",
  capacity: "容量",
  orderType: "订单类型",
  startsOn: "开始日期",
  endsOn: "结束日期",
  firstStart: "课程一开始",
  firstEnd: "课程一结束",
  secondStart: "课程二开始",
  secondEnd: "课程二结束",
  title: "主题",
  jobType: "任务类型",
  startedAt: "启动时间",
  finishedAt: "完成时间",
  eventType: "事件类型",
  aggregateType: "对象类型",
  lastCheckedAt: "最近检查",
  taskType: "任务",
  faqCategory: "问题类型",
  question: "问题",
  admin: "运营",
  email: "邮箱",
  name: "姓名",
  relationship: "关系",
  isPrimary: "主要联系人",
  weekday: "星期",
  amountCents: "金额",
  description: "内容",
  createdAt: "创建时间",
  paidAt: "支付时间",
  kind: "类型",
  type: "类型",
  mode: "模式",
  provider: "服务商",
  attempts: "尝试次数",
  lastError: "最近错误",
  startsAt: "开始时间",
  expiresAt: "到期时间",
  reason: "原因",
  billingStatus: "课时状态",
  feedback: "课堂反馈",
  channel: "渠道",
  subjectLine: "主题",
  body: "内容",
  sentAt: "发送时间",
};

const valueLabels: Record<string, string> = {
  active: "正常",
  inactive: "停用",
  paused: "暂停",
  prospect: "意向学生",
  scheduled: "待上课",
  completed: "已完成",
  cancelled: "已取消",
  pending: "待处理",
  paid: "已支付",
  succeeded: "成功",
  failed: "失败",
  queued: "待发送",
  sent: "已发送",
  processing: "处理中",
  open: "待处理",
  approved: "已批准",
  rejected: "已拒绝",
  requested: "待审批",
  present: "出勤",
  late: "迟到",
  absent: "缺席",
  regular: "正式课",
  trial: "试听课",
  makeup: "补课",
  private: "一对一",
  urgent: "紧急续费",
  renew_soon: "即将续费",
  new: "新咨询",
  contacted: "已联系",
  trial_scheduled: "已排试听",
  trial_completed: "试听完成",
  won: "已报名",
  lost: "已流失",
  attended: "已参加",
  no_show: "未到课",
  enrol: "报名",
  nurture: "继续跟进",
  no_enrol: "暂不报名",
  operations: "运营",
  billing: "财务",
  teaching: "教学",
  technical: "技术",
  healthy: "正常",
  degraded: "异常",
  unknown: "未知",
  live: "正式",
  sandbox: "测试",
  disabled: "停用",
  teacher: "老师",
  room: "教室",
  class: "班级",
  credit_top_up: "课时续费",
  true: "是",
  false: "否",
};

const hiddenTableFields = new Set([
  "id",
  "studentId",
  "inquiryId",
  "trialBookingId",
  "sessionId",
  "orderId",
  "firstSession",
  "secondSession",
]);

class ClientApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const errorMessages: Record<string, string> = {
  AUTH_REQUIRED: "登录已失效，请重新登录。",
  ROLE_FORBIDDEN: "当前账号无权执行此操作。",
  STUDENT_SCOPE_FORBIDDEN: "该学生不属于当前账号的管理范围。",
  INQUIRY_SCOPE_FORBIDDEN: "该咨询不属于当前账号的管理范围。",
  TEACHER_SCHEDULE_CONFLICT: "老师在该时段已有课程。",
  ROOM_SCHEDULE_CONFLICT: "教室在该时段已被占用。",
  STUDENT_SCHEDULE_CONFLICT: "学生在该时段已有课程。",
  CLASS_AT_CAPACITY: "目标班级已满员。",
  PAYMENT_EVENT_REUSED: "该支付记录已用于其他订单。",
  REQUEST_TIMEOUT: "请求超时，请稍后重试。",
  NETWORK_UNAVAILABLE: "网络暂时不可用。",
  DATABASE_UNAVAILABLE: "数据服务暂时不可用。",
};

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
      const code = body?.error?.code ?? "REQUEST_FAILED";
      throw new ClientApiError(code, errorMessages[code] ?? body?.error?.message ?? "请求失败。");
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
  return fieldLabels[value] ?? value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function displayValue(key: string, value: string | number | null): React.ReactNode {
  if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
  if (/amountCents$/i.test(key) && typeof value === "number") {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
  }
  if (key === "status" || key === "kind" || key === "type" || key === "mode" || key === "risk" || key === "outcome" || key === "decision" || key === "billingStatus") {
    return <Badge variant="outline" className="font-normal">{valueLabels[String(value)] ?? String(value).replaceAll("_", " ")}</Badge>;
  }
  if (key === "isPrimary") return valueLabels[String(Boolean(value))];
  if (key === "weekday" && typeof value === "number") return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][value] ?? value;
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
  return <span title={text} className="block max-w-72 truncate">{valueLabels[text] ?? text}</span>;
}

function DataTable({ rows }: { rows: Row[] }) {
  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!hiddenTableFields.has(key) && !keys.includes(key)) keys.push(key);
      }
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

function StudentDirectory({
  section,
  query,
  ownedStudents,
  organizationStudents,
  onQueryChange,
  onSearch,
  onPageChange,
  onView,
}: {
  section: OverviewSection;
  query: string;
  ownedStudents: number;
  organizationStudents: number;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onPageChange: (page: number) => void;
  onView: (studentId: string) => void;
}) {
  const page = section.page ?? 1;
  const pageSize = section.pageSize ?? 25;
  const total = section.totalRows ?? section.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span><strong>{ownedStudents.toLocaleString("zh-CN")}</strong> 名下学生</span>
          <span><strong>{organizationStudents.toLocaleString("zh-CN")}</strong> 全机构学生</span>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
          <Input aria-label="搜索学生" maxLength={80} placeholder="搜索姓名、学生编号或负责人" value={query} onChange={(event) => onQueryChange(event.target.value)} />
          <Button type="submit">搜索</Button>
          <Button type="button" variant="outline" disabled={!query} onClick={() => { onQueryChange(""); onSearch(""); }}>清除</Button>
        </form>
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>共 {total.toLocaleString("zh-CN")} 人 · 第 {page} / {pageCount} 页</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-white">
        <Table>
          <TableHeader><TableRow><TableHead>学生</TableHead><TableHead>状态</TableHead><TableHead>负责人</TableHead><TableHead>剩余课时</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {section.rows.map((row) => (
              <TableRow key={String(row.id)}>
                <TableCell><p className="font-medium">{String(row.student)}</p><p className="text-xs text-muted-foreground">{String(row.id)}</p></TableCell>
                <TableCell>{displayValue("status", row.status ?? null)}</TableCell>
                <TableCell>{displayValue("owner", row.owner ?? null)}</TableCell>
                <TableCell>{displayValue("credits", row.credits ?? null)}</TableCell>
                <TableCell><Button type="button" size="sm" variant="ghost" onClick={() => onView(String(row.id))}><Eye />查看</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function scheduleEvents(rows: Row[]): WeekCalendarEvent[] {
  return rows.map((row, index) => ({
    id: String(row.id ?? `${row.sessionDate ?? "date"}-${index}`),
    date: String(row.sessionDate ?? ""),
    startTime: String(row.startTime ?? "00:00"),
    endTime: String(row.endTime ?? row.startTime ?? "00:00"),
    title: String(row.className ?? "课程"),
    teacher: row.teacher === null || row.teacher === undefined ? null : String(row.teacher),
    room: row.room === null || row.room === undefined ? null : String(row.room),
    status: row.status === null || row.status === undefined ? null : String(row.status),
    kind: row.kind === null || row.kind === undefined ? null : String(row.kind),
    participants: typeof row.participants === "number" ? row.participants : null,
  }));
}

function StudentDetailSheet({
  open,
  onOpenChange,
  detail,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: StudentDetail | null;
  loading: boolean;
  error: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>{detail ? String(detail.student.preferredName ?? detail.student.legalName) : "学生详情"}</SheetTitle>
          <SheetDescription>{detail ? `${String(detail.student.id)} · ${valueLabels[String(detail.student.status)] ?? String(detail.student.status)}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          {loading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div> : null}
          {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {detail && !loading ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card><CardHeader className="pb-3"><CardDescription>负责人</CardDescription><CardTitle className="text-lg">{String(detail.student.owner ?? "—")}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-3"><CardDescription>剩余课时</CardDescription><CardTitle className="text-lg">{Number(detail.student.credits).toLocaleString("zh-CN")}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-3"><CardDescription>出生日期</CardDescription><CardTitle className="text-lg">{String(detail.student.dateOfBirth)}</CardTitle></CardHeader></Card>
              </div>
              <section><h3 className="mb-3 text-base font-semibold">本周课表</h3><WeekCalendar events={scheduleEvents(detail.schedule)} anchorDate={detail.week.startsOn} /></section>
              <section><h3 className="mb-3 text-base font-semibold">班级与老师</h3><DataTable rows={detail.enrollments} /></section>
              <section><h3 className="mb-3 text-base font-semibold">家长信息</h3><DataTable rows={detail.guardians} /></section>
              <section><h3 className="mb-3 text-base font-semibold">近期出勤</h3><DataTable rows={detail.attendance} /></section>
              <section><h3 className="mb-3 text-base font-semibold">课时订单</h3><DataTable rows={detail.orders} /></section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
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
  const [studentName, setStudentName] = useState("王晨");
  const [birthDate, setBirthDate] = useState("2015-04-12");
  const [guardianName, setGuardianName] = useState("王女士");
  const [guardianEmail, setGuardianEmail] = useState("guardian@example.test");
  const [guardianPhone, setGuardianPhone] = useState("0400 000 088");
  const [source, setSource] = useState("官网");
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
        <CardTitle>运营操作</CardTitle>
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
              <Field label="家长姓名" value={guardianName} onChange={setGuardianName} />
              <Field label="邮箱" value={guardianEmail} onChange={setGuardianEmail} type="email" />
              <Field label="电话" value={guardianPhone} onChange={setGuardianPhone} />
              <Field label="来源" value={source} onChange={setSource} />
            </>
          ) : mode === "trial" ? (
            <>
              <Field label="咨询编号" value={inquiryId} onChange={setInquiryId} />
              <Field label="老师编号" value={teacherId} onChange={setTeacherId} />
              <Field label="教室" value={roomName} onChange={setRoomName} />
              <Field label="日期" value={trialDate} onChange={setTrialDate} type="date" />
            </>
          ) : mode === "outcome" ? (
            <>
              <Field label="试听编号" value={trialBookingId} onChange={setTrialBookingId} />
            </>
          ) : mode === "convert" ? (
            <>
              <Field label="咨询编号" value={conversionInquiryId} onChange={setConversionInquiryId} />
              <Field label="班级编号" value={classSeriesId} onChange={setClassSeriesId} />
            </>
          ) : (
            <>
              <Field label="学生编号" value={renewalStudentId} onChange={setRenewalStudentId} />
              <Field label="续费课时" value={renewalCredits} onChange={setRenewalCredits} type="number" />
              <Field label="金额（AUD）" value={renewalAmount} onChange={setRenewalAmount} type="number" />
            </>
          )}
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? <RefreshCw className="animate-spin" /> : <Play />}
            {mode === "create" ? "创建咨询" : mode === "trial" ? "安排试听" : mode === "outcome" ? "保存试听结果" : mode === "convert" ? "办理报名" : "创建续费订单"}
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
      <CardHeader><CardTitle>审批队列</CardTitle></CardHeader>
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
        {!support ? <p className="text-sm text-muted-foreground">暂无待审批的支持申请</p> : null}
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
      toast.error(next.message);
    } finally {
      setFaqBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>课时与续费</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="购买课时" value={credits} onChange={setCredits} type="number" />
          <Field label="金额（AUD）" value={amount} onChange={setAmount} type="number" />
          <Button className="w-full" disabled={busy || !studentId} onClick={() => run({ action: "create_order", studentId, creditQuantity: Number(credits), amountCents: Math.round(Number(amount) * 100), description: `${credits} lesson renewal package` })}>
            <WalletCards />创建续费订单
          </Button>
          <Button variant="outline" className="w-full" disabled={busy || !pending} onClick={() => pending && run({ action: "sandbox_pay_order", orderId: String(pending.id), providerEventId: `portal_${crypto.randomUUID().replaceAll("-", "")}` })}>
            <Send />支付待付订单
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>帮助中心</CardTitle>
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
            {faqBusy ? "正在提交…" : "提交问题"}
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
  const [reason, setReason] = useState("检查后台任务异常");
  return (
    <Card>
      <CardHeader><CardTitle>系统运维</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" disabled={busy} onClick={() => run({ action: "process_outbox", limit: 20 })}>
          <RefreshCw />处理待发送任务
        </Button>
        <div className="space-y-2"><Label>紧急支持原因</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => run({ action: "request_support_session", reason, scope: ["diagnostics.read", "jobs.retry", "business.masked_read"], minutes: 30 })}>
          <ShieldAlert />申请临时支持
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlatformWorkspace({ role, viewer }: {
  role: Exclude<PlatformRole, "teacher">;
  viewer: Viewer;
}) {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<string>();
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDetailOpen, setStudentDetailOpen] = useState(false);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState("");

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
      toast.error(next.message);
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

  const openStudentDetail = async (studentId: string) => {
    setStudentDetailOpen(true);
    setStudentDetail(null);
    setStudentDetailError("");
    setStudentDetailLoading(true);
    try {
      setStudentDetail(
        await requestJson<StudentDetail>(
          `/api/platform/students/${encodeURIComponent(studentId)}`,
        ),
      );
    } catch (caught) {
      const next = caught instanceof ClientApiError
        ? caught
        : new ClientApiError("STUDENT_LOAD_FAILED", "学生信息加载失败。");
      setStudentDetailError(next.message);
    } finally {
      setStudentDetailLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-[var(--navy-800)] bg-[var(--navy-950)] text-white">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <span className="grid size-9 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]"><BookOpen className="size-[18px]" /></span>
          <div><p className="text-sm font-semibold">Austin Education</p><p className="text-xs text-slate-300">{roleLabels[role]}工作台</p></div>
          <div className="ml-auto hidden text-right sm:block"><p className="max-w-48 truncate text-sm font-medium">{viewer.displayName}</p><p className="text-xs text-slate-300">{viewer.email}</p></div>
          <form action="/api/auth/logout" method="post"><Button type="submit" variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" aria-label="退出登录"><LogOut /></Button></form>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid gap-3 sm:grid-cols-4">{[0,1,2,3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}</div><Skeleton className="h-96 rounded-2xl" /></div>
        ) : error ? (
          <Alert variant="destructive"><AlertCircle /><AlertTitle>加载失败</AlertTitle><AlertDescription>{error.message}<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>重试</Button></AlertDescription></Alert>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-sm font-semibold text-[var(--cyan-700)]">{roleLabels[role]}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[var(--navy-950)]">{data.title}</h1></div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}><RefreshCw className={busy ? "animate-spin" : ""} />刷新</Button>
            </div>
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
                          ? `共 ${section.rows.length} 条`
                          : `本页 ${section.rows.length} 条 · 共 ${section.totalRows.toLocaleString("zh-CN")} 条`}
                      </span>
                    </div>
                    {role === "operations_admin" && section.id === "students" ? (
                      <StudentDirectory
                        section={section}
                        query={studentSearch}
                        ownedStudents={data.context?.ownedStudentCount ?? 0}
                        organizationStudents={data.context?.organizationStudentCount ?? 0}
                        onQueryChange={setStudentSearch}
                        onSearch={(value) => updateStudentDirectory(value, 1)}
                        onPageChange={(page) => updateStudentDirectory(studentSearch, page)}
                        onView={(studentId) => void openStudentDetail(studentId)}
                      />
                    ) : section.id === "schedule" ? (
                      <WeekCalendar
                        events={scheduleEvents(section.rows)}
                        anchorDate={data.context?.businessDate ?? new Date().toISOString().slice(0, 10)}
                      />
                    ) : (
                      <DataTable rows={section.rows} />
                    )}
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
              </aside>
            </div>
          </>
        ) : null}
      </div>
      <StudentDetailSheet open={studentDetailOpen} onOpenChange={setStudentDetailOpen} detail={studentDetail} loading={studentDetailLoading} error={studentDetailError} />
      <Toaster position="bottom-center" />
    </main>
  );
}
