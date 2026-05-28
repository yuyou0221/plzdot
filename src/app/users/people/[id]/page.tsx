import { renderUserDataPage } from "@/app/users/user-data-page";

export const dynamic = "force-dynamic";

export default async function UserDataPersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return renderUserDataPage("people", id);
}
