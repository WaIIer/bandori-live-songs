import Link from "next/link";
import type { CopyDefinition } from "@/lib/i18n";

export function PublicFooter({ copy }: { copy: CopyDefinition }) {
  return (
    <footer className="mt-auto border-t border-border-soft">
      <div className="mx-auto flex w-full max-w-5xl justify-center gap-5 px-4 py-5 text-sm text-ink-soft sm:px-8">
        <Link href="/api" className="transition hover:text-foreground">
          {copy.apiDocsFooter}
        </Link>
        <a
          href="https://github.com/calcxx/bandori-live-songs"
          target="_blank"
          rel="noreferrer"
          aria-label={copy.githubRepoAria}
          className="transition hover:text-foreground"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
