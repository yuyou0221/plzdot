import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessInternalTestTools } from "@/lib/runtime-flags";

export const dynamic = "force-dynamic";

export default async function ImportsIndexPage() {
  const currentUser = await requireCurrentUser("/imports");
  const canOpenTestTools = canAccessInternalTestTools(currentUser);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <section className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-rose-700">数据导入说明</div>
          <h1 className="mt-2 text-2xl font-semibold">请选择对应模块的数据入口</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            正式数据不再使用一个通用导入页。项目排期、用户数据和测试工具各自有独立入口，避免把测试数据写进正式看板。
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <ImportLink href="/?view=project-entry" title="项目排期数据" description="在项目排期页使用项目主数据 Excel 导入区，导入后自动触发正式重算。" />
          <ImportLink href="/users/import" title="用户数据" description="人员、团队、外包、不可排期记录只从用户数据 Excel 更新。" />
          {canOpenTestTools ? (
            <ImportLink href="/imports/test-tools" title="排期测试工具" description="仅用于本地开发或管理员验证旧排期 JSON，不进入普通业务流程。" />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              <div className="font-semibold text-slate-900">排期测试工具</div>
              <p className="mt-2 leading-6">当前账号不可见。正式工作流不会展示测试入口。</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ImportLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rose-200 hover:bg-rose-50">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </Link>
  );
}

