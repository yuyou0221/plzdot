import { FinanceAccessDeniedPage, FinanceDataErrorPage, FinanceEstimationPage } from "@/components/finance/finance-estimation-page";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessFinance } from "@/lib/auth/permissions";
import { getFinanceEstimationData } from "@/lib/finance/finance-estimation-repository";

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const currentUser = await requireCurrentUser("/finance");

  if (!canAccessFinance(currentUser)) {
    return <FinanceAccessDeniedPage currentUser={currentUser} />;
  }

  const params = await searchParams;
  const year = params.year ? Number(params.year) : null;
  const data = await getFinanceEstimationData({ year: Number.isFinite(year) ? year : null }).catch((error) => {
    console.error("Failed to load finance estimation data.", error);
    return null;
  });

  if (!data) {
    return <FinanceDataErrorPage currentUser={currentUser} />;
  }

  return <FinanceEstimationPage currentUser={currentUser} data={data} />;
}
