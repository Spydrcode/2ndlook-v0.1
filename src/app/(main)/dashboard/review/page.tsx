"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { MIN_MEANINGFUL_ESTIMATES_PROD, WINDOW_DAYS } from "@/lib/config/limits";

interface BucketData {
  price_band_lt_500: number;
  price_band_500_1500: number;
  price_band_1500_5000: number;
  price_band_5000_plus: number;
  latency_band_0_2: number;
  latency_band_3_7: number;
  latency_band_8_21: number;
  latency_band_22_plus: number;
  weekly_volume: { week: string; count: number }[];
}

export default function ReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceId = searchParams.get("source_id");
  const notice = searchParams.get("notice");

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bucketData, setBucketData] = useState<BucketData | null>(null);
  const [estimateCount, setEstimateCount] = useState(0);
  const [sourceStatus, setSourceStatus] = useState<string | null>(null);
  const [requiredMin, setRequiredMin] = useState<number | null>(null);

  const isInsufficientDataNotice = useMemo(
    () => notice === "insufficient_data",
    [notice]
  );

  useEffect(() => {
    if (!sourceId) {
      setError("No source_id provided");
      setIsLoading(false);
      return;
    }

    async function loadBuckets() {
      try {
        const response = await fetch("/api/bucket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load data");
        }
        
        if (data.status) {
          setSourceStatus(data.status);
        }
        if (data.metadata?.required_min) {
          setRequiredMin(Number(data.metadata.required_min));
        }

        // Fetch the bucket data to display
        const bucketResponse = await fetch(`/api/bucket/${sourceId}`);
        const bucket = await bucketResponse.json();

        setBucketData(bucket);

        // Calculate total estimates
        const total =
          bucket.price_band_lt_500 +
          bucket.price_band_500_1500 +
          bucket.price_band_1500_5000 +
          bucket.price_band_5000_plus;
        setEstimateCount(total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    loadBuckets();
  }, [sourceId]);

  const handleGenerateSnapshot = async () => {
    if (!sourceId) return;
    if (estimateCount < MIN_MEANINGFUL_ESTIMATES_PROD) {
      setError(
        `Minimum ${MIN_MEANINGFUL_ESTIMATES_PROD} meaningful estimates required for a full snapshot.`
      );
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate snapshot");
      }

      router.push(`/dashboard/results/${data.snapshot_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  if (!sourceId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">No source selected</h1>
          <p className="text-muted-foreground">
            Please start by connecting a tool and importing data.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard/connect")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Connect
        </Button>
      </div>
    );
  }

  if (error || !bucketData) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "No data found"}</AlertDescription>
        </Alert>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard/connect")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connect
          </Button>
          <Button variant="outline" onClick={() => router.push(`/dashboard/import?category=estimates&tool=file`)}>
            Back to Import
          </Button>
        </div>
      </div>
    );
  }

  const effectiveRequiredMin = requiredMin || MIN_MEANINGFUL_ESTIMATES_PROD;
  const isInsufficientData =
    isInsufficientDataNotice ||
    sourceStatus === "insufficient_data" ||
    estimateCount < MIN_MEANINGFUL_ESTIMATES_PROD;

  const totalPriceItems =
    bucketData.price_band_lt_500 +
    bucketData.price_band_500_1500 +
    bucketData.price_band_1500_5000 +
    bucketData.price_band_5000_plus;

  const totalLatencyItems =
    bucketData.latency_band_0_2 +
    bucketData.latency_band_3_7 +
    bucketData.latency_band_8_21 +
    bucketData.latency_band_22_plus;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Review Snapshot Data</h1>
        <p className="text-muted-foreground">
          Confirm how your data has been grouped before generating a snapshot.
        </p>
      </div>
      
      {isInsufficientData && (
        <Alert>
          <AlertDescription>
            This is a small test dataset ({estimateCount} meaningful estimates). Full analysis requires {effectiveRequiredMin}+.
          </AlertDescription>
        </Alert>
      )}

      {/* What was included */}
      <Card>
        <CardHeader>
          <CardTitle>What was included</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-semibold">{estimateCount}</p>
            <p className="text-muted-foreground">meaningful estimates</p>
          </div>
          <p className="text-sm text-muted-foreground">Last {WINDOW_DAYS} days</p>
          <p className="text-sm text-muted-foreground">
            Sent/accepted/converted estimates only. No customer or line-item details.
          </p>
        </CardContent>
      </Card>

      {/* How the data is grouped */}
      <Card>
        <CardHeader>
          <CardTitle>How the data is grouped</CardTitle>
          <CardDescription>Distribution of estimates across price and time dimensions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Price distribution */}
          <div className="space-y-3">
            <h3 className="font-medium">Price distribution</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{"< $500"}</span>
                <span className="font-medium">{bucketData.price_band_lt_500}</span>
              </div>
              <Progress
                value={(bucketData.price_band_lt_500 / totalPriceItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">$500 – $1,500</span>
                <span className="font-medium">{bucketData.price_band_500_1500}</span>
              </div>
              <Progress
                value={(bucketData.price_band_500_1500 / totalPriceItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">$1,500 – $5,000</span>
                <span className="font-medium">{bucketData.price_band_1500_5000}</span>
              </div>
              <Progress
                value={(bucketData.price_band_1500_5000 / totalPriceItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">$5,000+</span>
                <span className="font-medium">{bucketData.price_band_5000_plus}</span>
              </div>
              <Progress
                value={(bucketData.price_band_5000_plus / totalPriceItems) * 100}
                className="h-2"
              />
            </div>
          </div>

          {/* Decision latency */}
          <div className="space-y-3">
            <h3 className="font-medium">Decision latency</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">0–2 days</span>
                <span className="font-medium">{bucketData.latency_band_0_2}</span>
              </div>
              <Progress
                value={(bucketData.latency_band_0_2 / totalLatencyItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">3–7 days</span>
                <span className="font-medium">{bucketData.latency_band_3_7}</span>
              </div>
              <Progress
                value={(bucketData.latency_band_3_7 / totalLatencyItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">8–21 days</span>
                <span className="font-medium">{bucketData.latency_band_8_21}</span>
              </div>
              <Progress
                value={(bucketData.latency_band_8_21 / totalLatencyItems) * 100}
                className="h-2"
              />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">22+ days</span>
                <span className="font-medium">{bucketData.latency_band_22_plus}</span>
              </div>
              <Progress
                value={(bucketData.latency_band_22_plus / totalLatencyItems) * 100}
                className="h-2"
              />
            </div>
          </div>

          {/* Demand over time */}
          <div className="space-y-3">
            <h3 className="font-medium">Demand over time</h3>
            <div className="space-y-2">
              {bucketData.weekly_volume.map((item) => (
                <div key={item.week} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.week}</span>
                  <span className="font-medium">{item.count} estimates</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation */}
      <Card>
        <CardHeader>
          <CardTitle>Generate snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will create a snapshot based on the groupings shown above. This does not change
            your systems or maintain a connection.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => router.back()} disabled={isGenerating}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button
              onClick={handleGenerateSnapshot}
              disabled={isGenerating || isInsufficientData}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Snapshot"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
