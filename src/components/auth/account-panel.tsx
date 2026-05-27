"use client";

import { UserCircle } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { authRoleLabels, type AuthUser } from "@/lib/auth/permissions";

type AccountPanelUser = Pick<AuthUser, "name" | "loginName" | "authRole">;

export function AccountPanel({ currentUser }: { currentUser: AccountPanelUser }) {
  const roleLabel = authRoleLabels[currentUser.authRole] ?? currentUser.authRole;

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
          <UserCircle size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">当前账号</div>
          <div className="truncate text-sm font-semibold text-slate-900" title={currentUser.name}>
            {currentUser.name}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-500">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span>登录名</span>
          <span className="truncate font-medium text-slate-700" title={currentUser.loginName}>
            {currentUser.loginName || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>权限</span>
          <span className="font-medium text-slate-700">{roleLabel}</span>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}
