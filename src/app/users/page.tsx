import { UserDataWorkbench } from "@/components/users/user-data-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessUserData, formatUserPermissionLevel } from "@/lib/auth/permissions";
import { getUserDataWorkbenchData } from "@/lib/user-data-repository";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await requireCurrentUser("/users");
  if (!canAccessUserData(currentUser)) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-rose-700">无法访问用户数据</div>
          <h1 className="mt-2 text-2xl font-semibold">当前账号没有用户数据页面权限</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            用户数据页面仅对权限等级 0，或岗位 / 业务角色为人力资源、人事、HR 的账号开放。
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            当前账号：{currentUser.name} · {formatUserPermissionLevel(currentUser.permissionLevel)}
          </div>
        </section>
      </main>
    );
  }

  const data = await getUserDataWorkbenchData(currentUser);

  return <UserDataWorkbench currentUser={currentUser} data={data} />;
}
