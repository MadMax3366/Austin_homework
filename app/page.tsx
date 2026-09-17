import { BookOpen, LockKeyhole } from "lucide-react";

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { TeacherWorkspace } from "@/app/teacher-workspace";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function SignIn() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border bg-white p-7 shadow-[0_24px_70px_rgb(12_36_57/10%)] sm:p-9">
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--navy-950)] text-[var(--cyan-400)]">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-7 text-sm font-semibold text-[var(--cyan-700)]">
          Austin Education
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--navy-950)]">
          Teacher workspace
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Sign in to view your assigned classes, record attendance, and complete
          class notes.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-7 w-full bg-[var(--navy-900)] hover:bg-[var(--navy-800)]"
        >
          <a href={chatGPTSignInPath("/")} target="_top">
            <LockKeyhole />
            Sign in with ChatGPT
          </a>
        </Button>
        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Access is restricted to active staff. Every attendance change is
          attributed to your account.
        </p>
      </section>
    </main>
  );
}

export default async function Home() {
  const identity = await getChatGPTUser();
  if (!identity) return <SignIn />;

  return (
    <TeacherWorkspace
      viewer={{
        displayName: identity.displayName,
        email: identity.email,
        signOutPath: chatGPTSignOutPath("/"),
      }}
    />
  );
}
