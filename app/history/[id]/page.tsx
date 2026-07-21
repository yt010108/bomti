import { HistoryDetailClient } from "./history-detail-client";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <HistoryDetailClient id={(await params).id} />;
}
