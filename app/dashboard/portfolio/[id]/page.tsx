import { notFound } from "next/navigation";
import { HoldingDetail } from "@/components/portfolio/holding-detail";

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();
  return (
    <div className="animate-fade-in-up">
      <HoldingDetail holdingId={id} />
    </div>
  );
}
