"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 2500;

type SnapshotStatus = "created" | "queued" | "running" | "complete" | "failed" | string;

type StatusResponse = {
  ok: boolean;
  status: SnapshotStatus;
  error?: string | null;
  hasResult?: boolean;
};

export function SnapshotStatusPoller({
  snapshotId,
  initialStatus,
}: {
  snapshotId: string;
  initialStatus: SnapshotStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SnapshotStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/snapshots/${snapshotId}/status`, { cache: "no-store" });
        const data = (await response.json()) as StatusResponse;

        if (!isMounted) return;

        if (!response.ok || !data.ok) {
          setError(data.error || "Unable to read snapshot status.");
          return;
        }

        setStatus(data.status);
        setError(data.error ?? null);

        if (data.status === "complete" || data.status === "failed") {
          router.refresh();
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to read snapshot status.");
      }
    };

    void fetchStatus();
    interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [router, snapshotId]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">Current status: {status}</p>
      {error ? <p className="text-red-600 text-sm">{error}</p> : null}
      <Button variant="outline" size="sm" onClick={() => router.refresh()}>
        Refresh now
      </Button>
    </div>
  );
}
