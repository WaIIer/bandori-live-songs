import { cookies } from "next/headers";
import { ApiDocsPageClient } from "@/components/api-docs-page-client";
import {
  adminAuthCookieName,
  verifyAdminAuthToken,
} from "@/lib/admin/auth";
import { getRequestLocale } from "@/lib/request-locale";

export const runtime = "nodejs";

export default async function ApiDocsPage() {
  const [locale, cookieStore] = await Promise.all([
    getRequestLocale(),
    cookies(),
  ]);
  const isAdminAuthenticated = await verifyAdminAuthToken(
    cookieStore.get(adminAuthCookieName)?.value,
  );

  return (
    <ApiDocsPageClient
      locale={locale}
      isAdminAuthenticated={isAdminAuthenticated}
    />
  );
}
