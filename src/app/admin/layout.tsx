import { AdminNav } from "@/components/admin-nav";
import { PublicFooter } from "@/components/public-footer";
import { cnCopy } from "@/lib/i18n/cn";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
      <PublicFooter copy={cnCopy} />
    </>
  );
}
