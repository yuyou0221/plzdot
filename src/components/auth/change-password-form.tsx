"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";

export function ChangePasswordForm({ returnPath = "/" }: { returnPath?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warning">("warning");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setMessageTone("warning");
        setMessage(result.message ?? "密码修改失败。");
        return;
      }

      setMessageTone("success");
      setMessage(result.message ?? "密码已更新。");
      resetForm();
    } catch {
      setMessageTone("warning");
      setMessage("密码修改接口暂时不可用。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <KeyRound size={15} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">修改密码</h1>
          <p className="mt-1 text-sm text-slate-500">保存后请使用新密码登录，账号会保持当前登录状态。</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
          当前密码
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
          新密码
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            maxLength={128}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
          确认新密码
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            maxLength={128}
            required
          />
        </label>
      </div>

      {message ? (
        <div
          className={
            messageTone === "success"
              ? "mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              : "mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          }
        >
          {messageTone === "success" ? <CheckCircle2 size={16} /> : null}
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href={returnPath}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          返回
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "保存中" : "保存"}
        </button>
      </div>
    </form>
  );
}
