"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [loginName, setLoginName] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginName, password }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setMessage(result.message ?? "登录失败。");
        return;
      }

      window.location.assign(nextPath);
    } catch {
      setMessage("登录接口暂时不可用。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[380px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
        <LogIn size={17} />
        登录
      </div>
      <h1 className="mt-3 text-2xl font-semibold text-slate-950">项目经营管理中台</h1>
      <div className="mt-1 text-sm text-slate-500">请输入账号和密码</div>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500">登录名</span>
          <input
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500">密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            required
          />
        </label>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogIn size={16} />
        {isSubmitting ? "登录中" : "登录"}
      </button>
    </form>
  );
}
