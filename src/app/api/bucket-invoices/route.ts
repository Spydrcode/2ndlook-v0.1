import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import type { InvoiceNormalized, InvoiceBucket } from "@/types/2ndlook";

interface BucketInvoicesRequest {
  source_id: string;
}

interface BucketInvoicesResponse {
  source_id: string;
  bucketed: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const body: BucketInvoicesRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json(
        { error: "source_id is required" },
        { status: 400 }
      );
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    // Fetch normalized invoices
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices_normalized")
      .select("*")
      .eq("source_id", source_id);

    if (invoicesError) {
      return NextResponse.json(
        { error: "Failed to fetch invoices" },
        { status: 500 }
      );
    }

    // Fail gracefully if no invoices
    if (!invoices || invoices.length === 0) {
      console.log(`[Invoice Bucket] No invoices found for source ${source_id} - estimate-only mode`);
      return NextResponse.json(
        { source_id, bucketed: false, message: "No invoices found - estimate-only mode" },
        { status: 200 }
      );
    }

    // Fetch estimates for time-to-invoice calculation
    const { data: estimates } = await supabase
      .from("estimates_normalized")
      .select("estimate_id, closed_at")
      .eq("source_id", source_id);

    const estimateMap = new Map(
      (estimates || []).map((est) => [est.estimate_id, est.closed_at ?? null])
    );

    // Apply bucketing rules
    const buckets = bucketInvoices(invoices as InvoiceNormalized[], estimateMap);

    // Check if bucket already exists
    const { data: existingBucket } = await supabase
      .from("invoice_buckets")
      .select("id")
      .eq("source_id", source_id)
      .single();

    if (existingBucket) {
      // Update existing bucket
      const { error: updateError } = await supabase
        .from("invoice_buckets")
        .update(buckets)
        .eq("source_id", source_id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update invoice buckets" },
          { status: 500 }
        );
      }
    } else {
      // Insert new bucket
      const { error: insertError } = await supabase
        .from("invoice_buckets")
        .insert({ source_id, ...buckets });

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to create invoice buckets" },
          { status: 500 }
        );
      }
    }

    const response: BucketInvoicesResponse = {
      source_id,
      bucketed: true,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Invoice bucket error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Bucket invoices into aggregated signals.
 * ONLY aggregated counts - no raw invoice records exposed to agents.
 */
function bucketInvoices(
  invoices: InvoiceNormalized[],
  estimateMap: Map<string, string | null>
): Omit<InvoiceBucket, "id" | "source_id" | "created_at"> {
  // Price band counters (same bands as estimates)
  let priceBandLt500 = 0;
  let priceBand5001500 = 0;
  let priceBand15005000 = 0;
  let priceBand5000Plus = 0;

  // Time-to-invoice counters (for linked invoices only)
  let timeToInvoice07 = 0;
  let timeToInvoice814 = 0;
  let timeToInvoice1530 = 0;
  let timeToInvoice31Plus = 0;

  // Status counters
  let statusDraft = 0;
  let statusSent = 0;
  let statusVoid = 0;
  let statusPaid = 0;
  let statusUnpaid = 0;
  let statusOverdue = 0;
  let statusRefunded = 0;
  let statusPartial = 0;
  let statusUnknown = 0;

  // Weekly volume map
  const weeklyMap = new Map<string, number>();

  for (const invoice of invoices) {
    const total = invoice.invoice_total;
    const invoiceDate = new Date(invoice.invoice_date);

    // Price bands
    if (total < 500) {
      priceBandLt500++;
    } else if (total < 1500) {
      priceBand5001500++;
    } else if (total < 5000) {
      priceBand15005000++;
    } else {
      priceBand5000Plus++;
    }

    // Time-to-invoice (only for linked invoices)
    if (invoice.linked_estimate_id && estimateMap.has(invoice.linked_estimate_id)) {
      const estimateClosedAtStr = estimateMap.get(invoice.linked_estimate_id);
      if (estimateClosedAtStr) {
        const estimateClosedAt = new Date(estimateClosedAtStr);
        const daysDiff = Math.floor(
          (invoiceDate.getTime() - estimateClosedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 7) {
          timeToInvoice07++;
        } else if (daysDiff <= 14) {
          timeToInvoice814++;
        } else if (daysDiff <= 30) {
          timeToInvoice1530++;
        } else {
          timeToInvoice31Plus++;
        }
      }
    }

    // Status distribution
    switch (invoice.invoice_status) {
      case "draft":
        statusDraft++;
        break;
      case "sent":
        statusSent++;
        break;
      case "void":
        statusVoid++;
        break;
      case "paid":
        statusPaid++;
        break;
      case "unpaid":
        statusUnpaid++;
        break;
      case "overdue":
        statusOverdue++;
        break;
      case "refunded":
        statusRefunded++;
        break;
      case "partial":
        statusPartial++;
        break;
      case "unknown":
      default:
        statusUnknown++;
        break;
    }

    // Weekly volume (ISO week format)
    const year = invoiceDate.getFullYear();
    const weekNum = getISOWeek(invoiceDate);
    const weekKey = `${year}-W${String(weekNum).padStart(2, "0")}`;
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + 1);
  }

  // Convert weekly map to sorted array
  const weeklyVolume = Array.from(weeklyMap.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return {
    price_band_lt_500: priceBandLt500,
    price_band_500_1500: priceBand5001500,
    price_band_1500_5000: priceBand15005000,
    price_band_5000_plus: priceBand5000Plus,
    time_to_invoice_0_7: timeToInvoice07,
    time_to_invoice_8_14: timeToInvoice814,
    time_to_invoice_15_30: timeToInvoice1530,
    time_to_invoice_31_plus: timeToInvoice31Plus,
    status_draft: statusDraft,
    status_sent: statusSent,
    status_void: statusVoid,
    status_paid: statusPaid,
    status_unpaid: statusUnpaid,
    status_overdue: statusOverdue,
    status_refunded: statusRefunded,
    status_partial: statusPartial,
    status_unknown: statusUnknown,
    weekly_volume: weeklyVolume,
  };
}

/**
 * Get ISO week number for a date.
 */
function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.floor(diff / 604800000);
}


