import Link from "next/link";

import { AlertCircle, ArrowLeft } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel, SnapshotOutput } from "@/types/2ndlook";

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
  const supabase = createAdminClient();
  const snapshotId = params.id;

  // Fetch snapshot with source
  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .select("*, sources!inner(installation_id)")
    .eq("id", snapshotId)
    .single();

  if (error || !snapshot) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Snapshot not found</h1>
          <p className="text-muted-foreground">This snapshot does not exist. Try running a new snapshot from Connect.</p>
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
  let snapshotResult: SnapshotOutput;
  try {
    snapshotResult = typeof snapshot.result === "string" ? JSON.parse(snapshot.result) : snapshot.result;
  } catch {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Unable to load snapshot data. The snapshot may be corrupted.</AlertDescription>
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

  if (snapshotResult.kind === "insufficient_data") {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Snapshot</h1>
          <p className="text-muted-foreground">Not enough history yet to produce a full decision snapshot.</p>
        </div>

        <Alert>
          <AlertDescription>
            We found {snapshotResult.found.estimates ?? 0} meaningful estimates in the last {snapshotResult.window_days}{" "}
            days. We need {snapshotResult.required_minimum.estimates} to generate a full snapshot.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>What you can do next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshotResult.what_you_can_do_next.map((item) => (
              <div key={item.label}>
                <p className="font-medium">{item.label}</p>
                <p className="text-muted-foreground text-sm">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disclaimers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshotResult.disclaimers.map((item) => (
              <p key={item} className="text-muted-foreground text-sm">
                {item}
              </p>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button asChild variant="outline">
            <Link href="/dashboard/connect">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Connect
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { signals, scores, findings, next_steps, disclaimers } = snapshotResult;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-2xl tracking-tight">Snapshot</h1>
          <Badge variant={getConfidenceBadgeVariant(scores.confidence)}>{scores.confidence}</Badge>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground text-sm">
          <span>{signals.totals.estimates ?? 0} meaningful estimates</span>
          <span>·</span>
          <span>{formatDate(snapshot.generated_at)}</span>
        </div>
        <p className="text-muted-foreground text-sm">Meaningful estimates only. No customer or line-item details.</p>
      </div>

      {/* Signals */}
      <Card>
        <CardHeader>
          <CardTitle>Signals</CardTitle>
          <CardDescription>Aggregated totals and status mix</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Totals</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimates</span>
                <span className="font-medium">{signals.totals.estimates ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Invoices</span>
                <span className="font-medium">{signals.totals.invoices ?? 0}</span>
              </div>
            </div>
          </div>
          {signals.status_breakdown && (
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Status breakdown</h3>
              <div className="space-y-2">
                {Object.entries(signals.status_breakdown).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{status}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scores */}
      <Card>
        <CardHeader>
          <CardTitle>Scores</CardTitle>
          <CardDescription>Signals summarized into 0-100 scores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Demand signal", value: scores.demand_signal },
            { label: "Cash signal", value: scores.cash_signal },
            { label: "Decision latency", value: scores.decision_latency },
            { label: "Capacity pressure", value: scores.capacity_pressure },
          ].map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">{item.value}</span>
              </div>
              <Progress value={item.value} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>Key takeaways from the signals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {findings.map((item) => (
            <div key={item.title}>
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground text-sm">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Next steps */}
      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
          <CardDescription>Suggested actions based on the snapshot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {next_steps.map((item) => (
            <div key={item.label}>
              <p className="font-medium">{item.label}</p>
              <p className="text-muted-foreground text-sm">{item.why}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Disclaimers */}
      <Card>
        <CardHeader>
          <CardTitle>Disclaimers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {disclaimers.map((item) => (
            <p key={item} className="text-muted-foreground text-sm">
              {item}
            </p>
          ))}
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
