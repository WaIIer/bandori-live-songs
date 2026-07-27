import type { Metadata } from "next";
import {
  Albert_Sans,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Sans_TC,
} from "next/font/google";
import { getCopy, getHtmlLang } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildThemeInitScript } from "@/lib/theme-init";
import "./globals.css";

const headingFont = Albert_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
});

const bodyFont = Noto_Sans_SC({
  variable: "--font-body-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFontTraditionalChinese = Noto_Sans_TC({
  variable: "--font-body-tc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFontJapanese = Noto_Sans_JP({
  variable: "--font-body-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getCopy(locale);

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
  };
}

const themeScript = buildThemeInitScript();

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html
      lang={getHtmlLang(locale)}
      suppressHydrationWarning
      className={`${headingFont.variable} ${bodyFont.variable} ${bodyFontTraditionalChinese.variable} ${bodyFontJapanese.variable} h-full antialiased`}
      data-locale={locale}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
