import { ProductGuidePrototype } from "@/components/product-guide/product-guide-prototype";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getProductGuidePrototypeData } from "@/lib/product-guide-prototype-data";

export const dynamic = "force-dynamic";

export default async function ProductGuidePrototypePage() {
  const [currentUser, scheduleData] = await Promise.all([
    requireCurrentUser("/product-guide/prototype"),
    getProductGuidePrototypeData(),
  ]);

  return <ProductGuidePrototype currentUserId={currentUser.id} currentUserName={currentUser.name} currentUserRole={currentUser.authRole} scheduleData={scheduleData} />;
}
