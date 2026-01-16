import Link from "next/link";

import { AlertCircle, ArrowRight } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel } from "@/types/2ndlook";

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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SnapshotsPage() {
  const installationId = await getInstallationId();
  const supabase = createAdminClient();

  // Fetch recent snapshots
  const { data: snapshots, error } = installationId
    ? await supabase
        .from("snapshots")
        .select("id, generated_at, estimate_count, confidence_level, source_id, sources!inner(installation_id)")
        .eq("sources.installation_id", installationId)
        .order("generated_at", { ascending: false })
        .limit(25)
    : { data: [], error: null };

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Snapshots</h1>
          <p className="text-muted-foreground">Recent snapshots you've created</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Unable to load snapshots. Please try again later.</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/dashboard/connect">Back to Connect</Link>
        </Button>
      </div>
    );
  }

  // Empty state
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Snapshots</h1>
          <p className="text-muted-foreground">Recent snapshots you've created</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="space-y-2 text-center">
              <p className="text-muted-foreground">No snapshots yet.</p>
            </div>
            <Button asChild>
              <Link href="/dashboard/connect">
                Create a snapshot
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              Need help?{" "}
              <a href="mailto:support@2ndlook.app" className="underline transition-colors hover:text-foreground">
                Contact support
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Snapshots</h1>
        <p className="text-muted-foreground">Recent snapshots you've created</p>
        <p className="text-muted-foreground text-sm">Meaningful estimates only. No customer or line-item details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your snapshots</CardTitle>
          <CardDescription>View and revisit previous snapshots</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Estimates</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell className="font-medium">{formatDate(snapshot.generated_at)}</TableCell>
                  <TableCell>{snapshot.estimate_count} meaningful</TableCell>
                  <TableCell>
                    <Badge variant={getConfidenceBadgeVariant(snapshot.confidence_level)}>
                      {snapshot.confidence_level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/results/${snapshot.id}`}>
                          View
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/results/${snapshot.id}/print`} target="_blank" rel="noreferrer">
                          PDF
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard/connect">
            Create new snapshot
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
