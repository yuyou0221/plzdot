import { ProductGuideMockLab } from "@/components/product-guide/product-guide-mock-lab";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function ProductGuideMockLabPage() {
  const currentUser = await requireCurrentUser("/product-guide/mock-lab");

  return <ProductGuideMockLab currentUserName={currentUser.name} />;
}
