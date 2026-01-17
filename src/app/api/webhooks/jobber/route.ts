import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { markConnectionDisconnected } from "@/lib/oauth/connections";
import { createAdminClient } from "@/lib/supabase/admin";

import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret).update(payload).digest();
  const signatureBuf = Buffer.from(signature, signature.length === 64 ? "hex" : "base64");
  if (signatureBuf.length !== hmac.length) return false;
  return timingSafeEqual(signatureBuf, hmac);
}

function readEventType(body: Record<string, unknown>): string | null {
  const candidate =
    (body.topic as string | undefined) ||
    (body.type as string | undefined) ||
    (body.event as { type?: string; topic?: string } | undefined)?.type ||
    (body.event as { type?: string; topic?: string } | undefined)?.topic;
  return candidate ?? null;
}

function readAccountId(body: Record<string, unknown>): string | null {
  const direct =
    (body.accountId as string | undefined) ||
    (body.account_id as string | undefined) ||
    (body.jobberAccountId as string | undefined);
  if (direct) return direct;

  const event = body.event as Record<string, unknown> | undefined;
  const data =
    (event?.data as Record<string, unknown> | undefined) ?? (body.data as Record<string, unknown> | undefined);
  const nested =
    (data?.accountId as string | undefined) ||
    (data?.account_id as string | undefined) ||
    ((data?.account as Record<string, unknown> | undefined)?.id as string | undefined);

  return nested ?? null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.JOBBER_WEBHOOK_SECRET;
  const signature =
    request.headers.get("x-jobber-signature") ??
    request.headers.get("x-jobber-hmac-sha256") ??
    request.headers.get("x-webhook-signature");

  if (secret && signature) {
    const ok = verifySignature(rawBody, signature, secret);
    if (!ok) {
      console.warn("Jobber webhook signature mismatch");
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  } else if (secret && !signature) {
    console.warn("Jobber webhook missing signature header");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("Invalid Jobber webhook payload:", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventType = readEventType(payload);
  if (eventType !== "APP_DISCONNECT") {
    return NextResponse.json({ ok: true });
  }

  const accountId = readAccountId(payload);
  if (!accountId) {
    console.warn("Jobber webhook missing account id");
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();
  const { data: connection, error } = await supabase
    .from("oauth_connections")
    .select("installation_id")
    .eq("provider", "jobber")
    .eq("external_account_id", accountId)
    .single();

  if (error || !connection) {
    console.warn("Jobber webhook disconnect for unknown account:", accountId);
    return NextResponse.json({ ok: true });
  }

  try {
    await markConnectionDisconnected({
      installationId: connection.installation_id,
      provider: "jobber",
      reason: "jobber_marketplace_disconnect",
      details: { account_id: accountId },
    });
  } catch (disconnectError) {
    console.error("Failed to clear Jobber connection from webhook:", disconnectError);
  }

  try {
    await logJobberConnectionEvent({
      installationId: connection.installation_id,
      phase: "webhook_disconnect",
      details: { account_id: accountId },
    });
  } catch (logError) {
    console.error("Failed to log Jobber webhook disconnect:", logError);
  }

  return NextResponse.json({ ok: true });
}
