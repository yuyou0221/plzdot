"use client";

import { FormEvent, useState } from "react";
import { KeyRound, X } from "lucide-react";

export function ChangePasswordForm({ isAvailable = true }: { isAvailable?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warning">("warning");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAvailable) {
    return null;
  }

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function closeForm() {
    setIsOpen(false);
    setMessage(null);
    resetForm();
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

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setMessage(null);
        }}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        <KeyRound size={15} />
        修改密码
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <KeyRound size={15} />
          修改密码
        </div>
        <button
          type="button"
          onClick={closeForm}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭修改密码"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          当前密码
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          新密码
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            maxLength={128}
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          确认新密码
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            maxLength={128}
            required
          />
        </label>
      </div>

      {message ? (
        <div
          className={
            messageTone === "success"
              ? "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
              : "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
          }
        >
          {message}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={closeForm}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "保存中" : "保存"}
        </button>
      </div>
    </form>
  );
}
