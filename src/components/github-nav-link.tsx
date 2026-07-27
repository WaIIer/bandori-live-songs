import { GithubIcon } from "lucide-react";
import { navPillOutline } from "@/components/nav-pill";
import { cnCopy } from "@/lib/i18n/cn";
import type { CopyDefinition } from "@/lib/i18n";

const githubRepoUrl = "https://github.com/calcxx/bandori-live-songs";

export function GithubNavLink({ copy = cnCopy }: { copy?: CopyDefinition }) {
  return (
    <a
      href={githubRepoUrl}
      target="_blank"
      rel="noreferrer"
      className={`${navPillOutline} w-8 max-sm:hidden @[28rem]/nav-bar:w-auto @[28rem]/nav-bar:gap-1.5 @[28rem]/nav-bar:px-3`}
      aria-label={copy.githubRepoAria}
    >
      <GithubIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden @[28rem]/nav-bar:inline">GitHub</span>
    </a>
  );
}
