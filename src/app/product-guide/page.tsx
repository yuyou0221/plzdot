import { ProductGuidePrototype } from "@/components/product-guide/product-guide-prototype";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getProductGuidePrototypeData } from "@/lib/product-guide-prototype-data";

export const dynamic = "force-dynamic";

export default async function ProductGuidePage() {
  const [currentUser, scheduleData] = await Promise.all([
    requireCurrentUser("/product-guide"),
    getProductGuidePrototypeData(),
  ]);

  return (
    <ProductGuidePrototype
      currentUser={currentUser}
      currentUserId={currentUser.id}
      currentUserName={currentUser.name}
      currentUserRole={currentUser.authRole}
      scheduleData={scheduleData}
      formal
    />
  );
}
