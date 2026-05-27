import { ProductGuideWorkbench } from "@/components/product-guide/product-guide-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getProductGuideData } from "@/lib/product-guide-repository";

export const dynamic = "force-dynamic";

export default async function ProductGuidePage() {
  const currentUser = await requireCurrentUser("/product-guide");
  const data = await getProductGuideData();

  return <ProductGuideWorkbench currentUser={currentUser} data={data} />;
}
