import { Suspense } from "react";
import { ExploreClient } from "@/components/explore/explore-client";

export const metadata = { title: "Explore — Twin" };

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-[12px] text-dim">loading…</div>}>
      <ExploreClient />
    </Suspense>
  );
}
