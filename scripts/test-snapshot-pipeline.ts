import type { BucketedAggregates } from "@/lib/mcp/client";
import { snapshotOutputSchema } from "@/lib/openai/schemas";
import { generateDecisionSnapshot } from "@/lib/openai/snapshot";
import { buildDeterministicSnapshot, validateBucketedAggregates } from "@/lib/orchestrator/deterministicSnapshot";

async function main() {
  // Avoid real model calls by default; set OPENAI_SNAPSHOT_ENABLED=true to hit the API.
  process.env.OPENAI_SNAPSHOT_ENABLED ??= "false";

  const aggregates: BucketedAggregates = {
    source_id: "source-test",
    source_tool: "jobber",
    estimate_count: 48,
    weekly_volume: [
      { week: "2025-W01", count: 10 },
      { week: "2025-W02", count: 12 },
      { week: "2025-W03", count: 13 },
      { week: "2025-W04", count: 13 },
    ],
    price_distribution: [
      { band: "<500", count: 5 },
      { band: "500-1500", count: 18 },
      { band: "1500-5000", count: 15 },
      { band: "5000+", count: 10 },
    ],
    latency_distribution: [
      { band: "0-2d", count: 12 },
      { band: "3-7d", count: 16 },
      { band: "8-21d", count: 14 },
      { band: "22+d", count: 6 },
    ],
    job_type_distribution: [
      { job_type: "install", count: 20 },
      { job_type: "repair", count: 15 },
      { job_type: "unknown", count: 13 },
    ],
    invoiceSignals: {
      invoice_count: 22,
      price_distribution: [
        { band: "<500", count: 4 },
        { band: "500-1500", count: 8 },
        { band: "1500-5000", count: 7 },
        { band: "5000+", count: 3 },
      ],
      time_to_invoice: [
        { band: "0-7d", count: 10 },
        { band: "8-14d", count: 6 },
        { band: "15-30d", count: 4 },
        { band: "31+d", count: 2 },
      ],
      status_distribution: [
        { status: "sent", count: 12 },
        { status: "paid", count: 8 },
        { status: "draft", count: 2 },
        { status: "overdue", count: 0 },
      ],
      weekly_volume: [
        { week: "2025-W01", count: 5 },
        { week: "2025-W02", count: 6 },
        { week: "2025-W03", count: 6 },
        { week: "2025-W04", count: 5 },
      ],
    },
  };

  validateBucketedAggregates(aggregates);

  const invoiceStatusCounts = Object.fromEntries(
    aggregates.invoiceSignals?.status_distribution.map((item) => [item.status, item.count]) ?? [],
  );

  const agentInput = {
    windowDays: 90 as const,
    connectorTools: aggregates.source_tool ? [aggregates.source_tool] : [],
    estimateSignals: {
      countsByStatus: {},
      totals: { estimates: aggregates.estimate_count },
      priceDistribution: aggregates.price_distribution,
      weeklyVolume: aggregates.weekly_volume,
      latencyDistribution: aggregates.latency_distribution,
      jobTypeDistribution: aggregates.job_type_distribution ?? [],
    },
    invoiceSignals: aggregates.invoiceSignals
      ? {
          countsByStatus: invoiceStatusCounts,
          totals: { invoices: aggregates.invoiceSignals.invoice_count },
          priceDistribution: aggregates.invoiceSignals.price_distribution,
          timeToInvoice: aggregates.invoiceSignals.time_to_invoice,
          weeklyVolume: aggregates.invoiceSignals.weekly_volume,
          statusDistribution: aggregates.invoiceSignals.status_distribution,
        }
      : undefined,
  };

  const llmResult = await generateDecisionSnapshot(agentInput);
  snapshotOutputSchema.parse(llmResult);
  console.log("LLM (or mock) snapshot schema valid:", llmResult.kind, llmResult.scores.confidence);

  const deterministicResult = buildDeterministicSnapshot(aggregates, aggregates.source_id, "snapshot-test");
  snapshotOutputSchema.parse(deterministicResult);
  console.log("Deterministic snapshot schema valid:", deterministicResult.kind, deterministicResult.scores.confidence);
}

main().catch((err) => {
  console.error("Snapshot test failed:", err);
  process.exit(1);
});
