import type { Metadata } from "next";
import { RankingClient } from "@/components/ranking-client";

export const metadata: Metadata = {
  title: "Listener Rankings | BanG Dream! Songs",
  description: "Eventer attendance and live-song completion rankings.",
};

export default function RankingPage() {
  return <RankingClient />;
}
