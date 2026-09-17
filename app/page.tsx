import { BookOpen, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login-form";
import { Button } from "@/components/ui/button";
import { getPlatformAccount, type PlatformRole } from "@/lib/account-auth";

export const dynamic = "force-dynamic";

const rolePriority: PlatformRole[] = [
  "operations_admin",
  "teacher",
  "manager_admin",
  "student",
  "guardian",
  "system_admin",
];

function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border bg-white p-7 shadow-[0_24px_70px_rgb(12_36_57/10%)] sm:p-9">
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--navy-950)] text-[var(--cyan-400)]">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-7 text-sm font-semibold text-[var(--cyan-700)]">Austin Education</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--navy-950)]">
          学生运营系统
        </h1>
        <LoginForm />
      </section>
    </main>
  );
}

export default async function Home() {
  const account = await getPlatformAccount();
  if (!account) return <LoginPage />;
  const role = rolePriority.find((candidate) =>
    account.roles.some((assignment) => assignment.role === candidate),
  );
  if (role) redirect(`/workspace/${role}`);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-5">
      <section className="max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <LockKeyhole className="mx-auto size-9 text-[var(--cyan-700)]" />
        <h1 className="mt-5 text-2xl font-semibold text-[var(--navy-950)]">账号尚未开通</h1>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="mt-6">退出登录</Button>
        </form>
      </section>
    </main>
  );
}
