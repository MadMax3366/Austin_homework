import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  HeartHandshake,
  LogOut,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlatformAccount, PlatformRole } from "@/lib/account-auth";

const rolePresentation: Record<
  PlatformRole,
  {
    title: string;
    eyebrow: string;
    description: string;
    icon: typeof BookOpen;
  }
> = {
  teacher: {
    title: "教师工作台",
    eyebrow: "Teacher",
    description: "今日课表、点名、课堂反馈和个人薪资。",
    icon: BookOpen,
  },
  operations_admin: {
    title: "运营工作台",
    eyebrow: "Operations",
    description: "咨询、试听、学生、排课、课时与续费。",
    icon: UsersRound,
  },
  manager_admin: {
    title: "主管管理台",
    eyebrow: "Manager admin",
    description: "全局排课、财务审批、薪资、权限与审计。",
    icon: ShieldCheck,
  },
  student: {
    title: "学生门户",
    eyebrow: "Student",
    description: "查看自己的课表、出勤、反馈与课时。",
    icon: GraduationCap,
  },
  guardian: {
    title: "家长门户",
    eyebrow: "Guardian",
    description: "管理关联学生、查看反馈并完成续费。",
    icon: HeartHandshake,
  },
  system_admin: {
    title: "系统运维台",
    eyebrow: "Platform admin",
    description: "集成、任务、outbox、审计与限时技术支持。",
    icon: Settings2,
  },
};

export function RoleLauncher({
  account,
  signOutPath,
}: {
  account: PlatformAccount;
  signOutPath: string;
}) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-foreground">
      <header className="border-b border-[var(--navy-800)] bg-[var(--navy-950)] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <span className="grid size-9 place-items-center rounded-lg bg-[var(--cyan-400)] text-[var(--navy-950)]">
            <BookOpen className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="ml-3">
            <p className="text-sm font-semibold">Austin Education</p>
            <p className="text-xs text-slate-300">Student operations system</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{account.displayName}</p>
              <p className="text-xs text-slate-300">{account.email}</p>
            </div>
            <Button asChild variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white">
              <a href={signOutPath} target="_top" aria-label="Sign out"><LogOut /></a>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[var(--cyan-700)]">选择当前职责</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--navy-950)] sm:text-4xl">
            一个账号，多种受控工作身份
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            每个入口都在服务端重新校验角色与对象范围；切换工作台不会扩大权限。
          </p>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {account.roles.map((assignment) => {
            const item = rolePresentation[assignment.role];
            const Icon = item.icon;
            return (
              <a
                key={assignment.id}
                href={`/workspace/${assignment.role}`}
                className="group rounded-2xl border border-border bg-white p-5 shadow-[0_14px_40px_rgb(12_36_57/6%)] transition hover:-translate-y-0.5 hover:border-[var(--cyan-500)] hover:shadow-[0_18px_50px_rgb(12_36_57/10%)]"
              >
                <div className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--navy-950)] text-[var(--cyan-400)]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {item.eyebrow}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--navy-950)]">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="mt-1 size-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[var(--cyan-700)]" />
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
