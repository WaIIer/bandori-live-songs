import { ChartNoAxesColumnIncreasingIcon } from "lucide-react";
import Link from "next/link";
import { navPillOutline } from "@/components/nav-pill";
import type { CopyDefinition } from "@/lib/i18n";

export function SongsStatsNavLink({
  copy,
  active = false,
}: {
  copy: CopyDefinition;
  active?: boolean;
}) {
  return (
    <Link
      href="/songs"
      aria-label={copy.songStatsNav}
      aria-current={active ? "page" : undefined}
      className={`${navPillOutline} w-8 @[28rem]/nav-bar:w-auto @[28rem]/nav-bar:gap-1.5 @[28rem]/nav-bar:px-3 ${
        active ? "border-accent text-accent" : ""
      }`}
    >
      <ChartNoAxesColumnIncreasingIcon
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <span className="hidden @[28rem]/nav-bar:inline">
        {copy.songStatsNav}
      </span>
    </Link>
  );
}
