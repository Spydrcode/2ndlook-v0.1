import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { AutoPrint } from "@/components/print/AutoPrint";
import { Badge } from "@/components/ui/badge";
import { getInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel, SnapshotOutput } from "@/types/2ndlook";

import "./print.css";

interface PrintPageProps {
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

export default async function PrintPage({ params }: PrintPageProps) {
  const supabase = createAdminClient();
  const snapshotId = params.id;
  const installationId = await getInstallationId();

  if (!installationId) {
    return (
      <div className="print-body">
        <div className="no-print mb-4">
          <Link href="/dashboard/connect" className="text-blue-600 text-sm">
            <ArrowLeft className="mr-2 inline h-4 w-4" />
            Back
          </Link>
        </div>
        <h1>Snapshot not found</h1>
      </div>
    );
  }

  const { data: snapshot } = await supabase.from("snapshots").select("*").eq("id", snapshotId).single();

  if (!snapshot) {
    return (
      <div className="print-body">
        <div className="no-print mb-4">
          <Link href={`/dashboard/results/${snapshotId}`} className="text-blue-600 text-sm">
            <ArrowLeft className="mr-2 inline h-4 w-4" />
            Back
          </Link>
        </div>
        <h1>Snapshot not found</h1>
      </div>
    );
  }

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("installation_id")
    .eq("id", snapshot.source_id)
    .single();

  if (sourceError || !source || source.installation_id !== installationId) {
    return (
      <div className="print-body">
        <div className="no-print mb-4">
          <Link href="/dashboard/connect" className="text-blue-600 text-sm">
            <ArrowLeft className="mr-2 inline h-4 w-4" />
            Back
          </Link>
        </div>
        <h1>Snapshot not found</h1>
      </div>
    );
  }

  const snapshotResult: SnapshotOutput =
    typeof snapshot.result === "string" ? JSON.parse(snapshot.result) : snapshot.result;

  if (snapshotResult.kind === "insufficient_data") {
    return (
      <div className="print-body">
        <div className="no-print mb-4">
          <AutoPrint />
          <Link href={`/dashboard/results/${snapshotId}`} className="text-blue-600 text-sm">
            <ArrowLeft className="mr-2 inline h-4 w-4" />
            Back
          </Link>
        </div>
        <h1>2ndlook Snapshot</h1>
        <p className="text-muted text-sm">Generated {formatDate(snapshot.generated_at)}</p>
        <section>
          <h2>Insufficient data</h2>
          <p>
            We found {snapshotResult.found.estimates ?? 0} meaningful estimates in the last {snapshotResult.window_days}{" "}
            days. We need {snapshotResult.required_minimum.estimates} to generate a full snapshot.
          </p>
        </section>
        <section>
          <h3>What you can do next</h3>
          <ul>
            {snapshotResult.what_you_can_do_next.map((item) => (
              <li key={item.label}>
                <strong>{item.label}:</strong> {item.detail}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Disclaimers</h3>
          <ul>
            {snapshotResult.disclaimers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const { signals, scores, findings, next_steps, disclaimers } = snapshotResult;

  return (
    <div className="print-body">
      <AutoPrint />
      <div className="no-print mb-4">
        <Link href={`/dashboard/results/${snapshotId}`} className="text-blue-600 text-sm">
          <ArrowLeft className="mr-2 inline h-4 w-4" />
          Back
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-2xl">2ndlook Snapshot</h1>
          <Badge variant={getConfidenceBadgeVariant(scores.confidence)}>{scores.confidence}</Badge>
        </div>
        <p className="text-muted text-sm">Generated {formatDate(snapshot.generated_at)}</p>
      </header>

      <section className="space-y-2">
        <h2>What this means</h2>
        {findings.map((item) => (
          <p key={item.title} className="text-sm">
            <strong>{item.title}:</strong> {item.detail}
          </p>
        ))}
      </section>

      <section className="space-y-2">
        <h2>Do next</h2>
        <ol className="list-decimal pl-5 text-sm">
          {next_steps.map((item) => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.why}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2>Supporting signals</h2>
        <p className="text-sm">
          Estimates: <strong>{signals.totals.estimates ?? 0}</strong> | Invoices:{" "}
          <strong>{signals.totals.invoices ?? 0}</strong>
        </p>
        {signals.status_breakdown && (
          <div>
            <p className="font-medium text-sm">Status mix</p>
            <ul className="list-disc pl-5 text-sm">
              {Object.entries(signals.status_breakdown).map(([status, count]) => (
                <li key={status}>
                  {status}: {count}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-1">
        <h2>Disclaimers</h2>
        <ul className="list-disc pl-5 text-sm">
          {disclaimers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
