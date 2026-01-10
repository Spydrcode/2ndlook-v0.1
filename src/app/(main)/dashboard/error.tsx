"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Something didn't load correctly
          </CardTitle>
          <CardDescription>
            You can return to Connect or try loading this page again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === "development" && error.message && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs font-mono">
                {error.message}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/dashboard/connect">Return to Connect</Link>
            </Button>
            <Button onClick={reset} className="flex-1">
              Try again
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Need help?{" "}
            <a
              href="mailto:support@2ndlook.app"
              className="underline hover:text-foreground transition-colors"
            >
              Contact support
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
