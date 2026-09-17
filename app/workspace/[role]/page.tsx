import { redirect } from "next/navigation";
import Link from "next/link";

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
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
        <p className="text-sm font-semibold text-destructive">403 · Role not assigned</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--navy-950)]">无法进入这个工作台</h1>
        <p className="mt-3 text-muted-foreground">隐藏菜单不是权限控制；服务端没有找到对应的有效角色授权。</p>
        <Button asChild className="mt-6"><Link href="/">返回角色选择</Link></Button>
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
  const identity = await getChatGPTUser();
  if (!identity) redirect(chatGPTSignInPath(`/workspace/${role}`));
  const account = await getPlatformAccount();
  if (!account || !account.roles.some((item) => item.role === role)) {
    return <ForbiddenWorkspace />;
  }
  const viewer = {
    displayName: identity.displayName,
    email: identity.email,
    signOutPath: chatGPTSignOutPath("/"),
  };
  if (role === "teacher") return <TeacherWorkspace viewer={viewer} />;
  return (
    <PlatformWorkspace
      role={role}
      viewer={viewer}
      availableRoles={account.roles.map((item) => item.role)}
    />
  );
}
