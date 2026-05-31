import Link from "next/link";

type AccessDeniedPanelProps = {
  title?: string;
  message?: string;
};

export function AccessDeniedPanel({
  title = "当前账号不能访问这个工具",
  message = "测试工具只允许本地开发或管理员直接访问，正式工作页面不会显示入口。",
}: AccessDeniedPanelProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">{title}</div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          返回项目排期
        </Link>
      </section>
    </main>
  );
}

