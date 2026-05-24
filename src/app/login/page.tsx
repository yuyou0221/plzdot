import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { ensureDefaultAdminUser } from "@/lib/auth/default-admin";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await ensureDefaultAdminUser();

  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect(nextPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f8] px-4 py-8 text-slate-950">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/";
  }

  return value;
}
