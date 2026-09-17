import { redirect } from "next/navigation";
import Link from "next/link";

import { PlatformWorkspace } from "@/app/platform-workspace";
import { TeacherWorkspace } from "@/app/teacher-workspace";
import { Button } from "@/components/ui/button";
import {
  getPlatformAccount,
  type PlatformRole,
} from "@/lib/account-auth";

export const dynamic = "force-dynamic";

const roles: PlatformRole[] = [
  "teacher",
  "operations_admin",
  "manager_admin",
  "student",
  "guardian",
  "system_admin",
];

function ForbiddenWorkspace() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-5">
      <section className="max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-destructive">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--navy-950)]">无法进入这个工作台</h1>
        <Button asChild className="mt-6"><Link href="/">返回首页</Link></Button>
      </section>
    </main>
  );
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: rawRole } = await params;
  if (!roles.includes(rawRole as PlatformRole)) redirect("/");
  const role = rawRole as PlatformRole;
  const account = await getPlatformAccount();
  if (!account) redirect("/");
  if (!account || !account.roles.some((item) => item.role === role)) {
    return <ForbiddenWorkspace />;
  }
  const viewer = {
    displayName: account.displayName,
    email: account.email,
  };
  if (role === "teacher") return <TeacherWorkspace viewer={viewer} />;
  return (
    <PlatformWorkspace
      role={role}
      viewer={viewer}
    />
  );
}
