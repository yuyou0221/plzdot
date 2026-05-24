import { UserDataWorkbench } from "@/components/users/user-data-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getUserDataWorkbenchData } from "@/lib/user-data-repository";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await requireCurrentUser("/users");
  const data = await getUserDataWorkbenchData();

  return <UserDataWorkbench currentUser={currentUser} data={data} />;
}
