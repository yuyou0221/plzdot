import Link from "next/link";
import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";
import { FinanceProjectFactEditor } from "@/components/finance/finance-project-fact-editor";
import { AppSideNav } from "@/components/layout/app-side-nav";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessFinance } from "@/lib/auth/permissions";
import { getFinanceProjectEstimate } from "@/lib/finance/finance-estimation-repository";

export const dynamic = "force-dynamic";

export default async function FinanceProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const currentUser = await requireCurrentUser("/finance");

  if (!canAccessFinance(currentUser)) {
    return <FinanceProjectAccessDeniedPage />;
  }

  const { projectId } = await params;
  const project = await getFinanceProjectEstimate(projectId).catch((error) => {
    console.error("Failed to load finance project estimate.", error);
    return null;
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="border-r border-slate-200 bg-white px-5 py-6 max-xl:border-b max-xl:border-r-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">PLZDOT</p>
            <h1 className="mt-2 text-xl font-black text-slate-950">项目管理平台</h1>
            <p className="mt-1 text-sm text-slate-500">项目财务编辑</p>
          </div>
          <AppSideNav currentPath="/finance" currentUser={currentUser} />
          <AccountPanel currentUser={currentUser} />
        </aside>

        <main className="px-6 py-6 max-md:px-4">
          <FinanceProjectFactEditor project={project} />
        </main>
      </div>
    </div>
  );
}

function FinanceProjectAccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f6f8] px-6 py-10 text-slate-950">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <LockKeyhole size={22} />
        </div>
        <h2 className="mt-4 text-xl font-black text-slate-950">财务测算仅管理员可见</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">当前账号没有进入项目财务编辑页的权限。</p>
        <Link href="/finance" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700">
          返回财务测算
        </Link>
      </section>
    </div>
  );
}
