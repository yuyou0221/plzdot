import { UserDataWorkbench } from "@/components/users/user-data-workbench";
import { getUserDataWorkbenchData } from "@/lib/user-data-repository";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const data = await getUserDataWorkbenchData();

  return <UserDataWorkbench data={data} />;
}
