"use client";

import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Something didn't load correctly
          </CardTitle>
          <CardDescription>You can return to Connect or try loading this page again.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === "development" && error.message && (
            <Alert variant="destructive">
              <AlertDescription className="font-mono text-xs">{error.message}</AlertDescription>
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
          <p className="text-center text-muted-foreground text-sm">
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
