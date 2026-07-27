import { cookies, headers } from "next/headers";
import {
  normalizeStoredLocale,
  resolveLocaleFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n";
import { localeCookieName } from "@/lib/locale-cookie";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const storedLocale = normalizeStoredLocale(cookieStore.get(localeCookieName)?.value);

  if (storedLocale) {
    return storedLocale;
  }

  const headerStore = await headers();
  return resolveLocaleFromAcceptLanguage(headerStore.get("accept-language"));
}
