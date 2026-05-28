import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, UserCircle } from "lucide-react";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { authRoleLabels } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const currentUser = await requireCurrentUser("/account/password");

  if (currentUser.id === "auth-disabled") {
    redirect("/");
  }

  const params = await searchParams;
  const returnPath = safeReturnPath(params.next);
  const roleLabel = authRoleLabels[currentUser.authRole] ?? currentUser.authRole;

  return (
    <main className="min-h-screen bg-[#f3f6f8] px-4 py-8 text-slate-950">
      <div className="mx-auto grid w-full max-w-[980px] gap-5">
        <Link
          href={returnPath}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          返回
        </Link>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ChangePasswordForm returnPath={returnPath} />

          <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200">
                <UserCircle size={24} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500">当前账号</div>
                <div className="truncate text-base font-semibold text-slate-950" title={currentUser.name}>
                  {currentUser.name}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-slate-500">登录名</span>
                <span className="truncate font-semibold text-slate-800" title={currentUser.loginName}>
                  {currentUser.loginName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">权限</span>
                <span className="font-semibold text-slate-800">{roleLabel}</span>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <ShieldCheck size={16} />
                密码保存说明
              </div>
              <p className="mt-2 leading-6">
                修改后会同步更新登录密码和用户数据 Excel 可导出的密码记录。请保存后使用新密码登录。
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function safeReturnPath(value: string | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login") ||
    value.startsWith("/account/password")
  ) {
    return "/";
  }

  return value;
}
