"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as {
        redirectTo?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? "登录失败，请稍后重试。");
        return;
      }
      window.location.assign(payload.redirectTo ?? "/");
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" type="email" autoComplete="username" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input id="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full bg-[var(--navy-900)] hover:bg-[var(--navy-800)]" disabled={busy}>
        <LockKeyhole />
        {busy ? "正在登录…" : "登录"}
      </Button>
    </form>
  );
}
