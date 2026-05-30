import { UserDataPortal, type UserDataView } from "@/components/users/user-data-portal";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessUserData, formatUserPermissionLevel } from "@/lib/auth/permissions";
import { getUserDataWorkbenchData } from "@/lib/user-data-repository";

export async function renderUserDataPage(view: UserDataView, selectedPersonId?: string) {
  const currentUser = await requireCurrentUser(userDataPathForView(view, selectedPersonId));

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

  if (view === "audit" && currentUser.permissionLevel !== 0) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-rose-700">无法访问审计记录</div>
          <h1 className="mt-2 text-2xl font-semibold">审计记录仅权限等级 0 可见</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            该页面包含用户数据高风险操作记录，仅最高权限账号可以查看。
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            当前账号：{currentUser.name} · {formatUserPermissionLevel(currentUser.permissionLevel)}
          </div>
        </section>
      </main>
    );
  }

  const data = await getUserDataWorkbenchData(currentUser);

  return <UserDataPortal currentUser={currentUser} data={data} selectedPersonId={selectedPersonId} view={view} />;
}

function userDataPathForView(view: UserDataView, selectedPersonId?: string) {
  if (view === "people" && selectedPersonId) {
    return `/users/people/${selectedPersonId}`;
  }

  const paths: Record<UserDataView, string> = {
    overview: "/users",
    import: "/users/import",
    people: "/users/people",
    teams: "/users/teams",
    modeling: "/users/modeling",
    availability: "/users/availability",
    vendors: "/users/vendors",
    moduleViews: "/users/module-views",
    audit: "/users/audit",
  };

  return paths[view];
}
