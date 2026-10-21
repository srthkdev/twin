import { notFound } from "next/navigation";
import { ReportDocument, SharedPlaces } from "@/components/agent/report-view";
import { storeGet } from "@/lib/agent/store";
import type { Report } from "@/lib/agent/report-types";

export default async function SharedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{6,16}$/.test(id)) notFound();
  const report = await storeGet<Report>(`reports/${id}.json`) ?? await storeGet<Report>(`reports/${id}`);
  if (!report || report.id !== id) notFound();
  return (
    <main className="report-share min-h-dvh px-4 pb-16 pt-14 sm:px-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="print-hidden mb-5 flex items-center justify-between gap-4 border-b border-line pb-3">
          <span className="label">Twin / shared report</span>
          <a href="/explore" className="text-[10.5px] text-dim hover:text-primary">Explore Twin →</a>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
          <ReportDocument report={report} />
          <SharedPlaces report={report} />
        </div>
      </div>
    </main>
  );
}
