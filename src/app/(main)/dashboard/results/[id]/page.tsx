import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstallationId } from "@/lib/installations/cookie";
import type { SnapshotResult, ConfidenceLevel } from "@/types/2ndlook";

interface ResultsPageProps {
  params: {
    id: string;
  };
}

function getConfidenceBadgeVariant(level: ConfidenceLevel): "default" | "secondary" | "outline" {
  switch (level) {
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const installationId = await getInstallationId();
  const supabase = createAdminClient();
  const snapshotId = params.id;

  // Fetch snapshot
  const { data: snapshot, error } = installationId
    ? await supabase
        .from("snapshots")
        .select("*, sources!inner(installation_id)")
        .eq("id", snapshotId)
        .eq("sources.installation_id", installationId)
        .single()
    : { data: null, error: null };

  if (error || !snapshot) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Snapshot not found</h1>
          <p className="text-muted-foreground">
            This snapshot does not exist or you don't have permission to view it.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/connect">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connect
          </Link>
        </Button>
      </div>
    );
  }

  // Parse snapshot result
  let snapshotResult: SnapshotResult;
  try {
    snapshotResult = typeof snapshot.result === "string" 
      ? JSON.parse(snapshot.result) 
      : snapshot.result;
  } catch {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to load snapshot data. The snapshot may be corrupted.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/dashboard/connect">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connect
          </Link>
        </Button>
      </div>
    );
  }

  const { meta, demand, decision_latency } = snapshotResult;

  // Calculate totals for percentage bars
  const totalPriceCount = demand.price_distribution.reduce((sum, item) => sum + item.count, 0);
  const totalLatencyCount = decision_latency.distribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Snapshot</h1>
          <Badge variant={getConfidenceBadgeVariant(meta.confidence_level)}>
            {meta.confidence_level}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{meta.estimate_count} meaningful estimates</span>
          <span>•</span>
          <span>{formatDate(meta.generated_at)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Meaningful estimates only. No customer or line-item details.
        </p>
      </div>

      {/* Demand */}
      <Card>
        <CardHeader>
          <CardTitle>Demand</CardTitle>
          <CardDescription>Distribution of meaningful estimates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Price distribution */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Price distribution</h3>
            <div className="space-y-2">
              {demand.price_distribution.map((item) => (
                <div key={item.band}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{item.band}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <Progress
                    value={totalPriceCount > 0 ? (item.count / totalPriceCount) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Weekly volume */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Weekly volume</h3>
            <div className="space-y-2">
              {demand.weekly_volume.slice(-10).map((item) => (
                <div key={item.week} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.week}</span>
                  <span className="font-medium">{item.count} estimates</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision Latency */}
      <Card>
        <CardHeader>
          <CardTitle>Decision latency</CardTitle>
          <CardDescription>Time from estimate created to decision</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {decision_latency.distribution.map((item) => (
              <div key={item.band}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{item.band}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
                <Progress
                  value={totalLatencyCount > 0 ? (item.count / totalLatencyCount) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/dashboard/connect">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Run another snapshot
          </Link>
        </Button>
      </div>
    </div>
  );
}

