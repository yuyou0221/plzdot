import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { bypassAuthUser, isAuthEnabled, type AuthUser } from "@/lib/auth/permissions";

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthEnabled()) {
    return bypassAuthUser;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      loginName: true,
      authRole: true,
      passwordHash: true,
      status: true,
    },
  });

  if (!user?.loginName || !user.passwordHash || user.status === "停用") {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    loginName: user.loginName,
    authRole: user.authRole,
  };
}

export async function requireCurrentUser(nextPath: string) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}
