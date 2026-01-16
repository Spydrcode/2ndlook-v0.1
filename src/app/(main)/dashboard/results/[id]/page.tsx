import Link from "next/link";

import { AlertCircle, ArrowLeft, Download } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <p className="text-muted-foreground">
            This snapshot does not exist. Try running a new snapshot from Connect.
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-2xl tracking-tight">Decision snapshot</h1>
            <Badge variant={getConfidenceBadgeVariant(scores.confidence)}>{scores.confidence}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
            <span>{signals.totals.estimates ?? 0} meaningful estimates</span>
            <span>·</span>
            <span>{formatDate(snapshot.generated_at)}</span>
          </div>
          <p className="text-muted-foreground text-sm">Aggregated signals only. No customer or line-item details.</p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button asChild variant="outline" className="gap-2" size="sm">
            <Link href={`/dashboard/results/${snapshotId}/print`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download PDF
            </Link>
          </Button>
          <p className="text-muted-foreground text-xs">Opens a print-friendly version you can save as PDF.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What this means</CardTitle>
          <CardDescription>Finite conclusions to reduce decision burden</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Do next</CardTitle>
          <CardDescription>Low-effort, ranked actions</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>If you want to implement this yourself</CardTitle>
          <CardDescription>Pick one move at a time and keep it calm.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {next_steps.slice(0, 3).map((item) => (
              <li key={item.label}>{item.label}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>If you want a second set of hands</CardTitle>
          <CardDescription>
            We can plug in a deeper layer when you’re ready — without changing your tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            Chat with us
          </Button>
          <p className="text-muted-foreground text-xs">Soft invitation only; no pressure.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supporting signals</CardTitle>
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
              <h3 className="font-medium text-sm">Status mix</h3>
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

      <Accordion type="single" collapsible className="rounded-lg border">
        <AccordionItem value="scores">
          <AccordionTrigger className="px-4">Optional detail (how we summarized the signals)</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-2 text-sm">
              <p className="font-medium">Signal summary (internal weighting)</p>
              <div className="space-y-1">
                {[
                  { label: "Demand signal", value: scores.demand_signal },
                  { label: "Cash signal", value: scores.cash_signal },
                  { label: "Decision latency", value: scores.decision_latency },
                  { label: "Capacity pressure", value: scores.capacity_pressure },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Internal view only; not meant as KPIs or ongoing monitoring.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
