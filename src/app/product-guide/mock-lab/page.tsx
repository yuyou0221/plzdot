import { ProductGuideMockLab } from "@/components/product-guide/product-guide-mock-lab";
import { AccessDeniedPanel } from "@/components/layout/access-denied-panel";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessInternalTestTools } from "@/lib/runtime-flags";

export const dynamic = "force-dynamic";

export default async function ProductGuideMockLabPage() {
  const currentUser = await requireCurrentUser("/product-guide/mock-lab");

  if (!canAccessInternalTestTools(currentUser)) {
    return <AccessDeniedPanel />;
  }

  return <ProductGuideMockLab currentUserName={currentUser.name} />;
}
