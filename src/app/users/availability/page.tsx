import { renderUserDataPage } from "@/app/users/user-data-page";

export const dynamic = "force-dynamic";

export default async function UserDataAvailabilityPage() {
  return renderUserDataPage("availability");
}
