"use client";

import Link from "next/link";

import { ArrowRight, Download, Printer, RefreshCw, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const handlePrint = () => {
  window.print();
};

export default function NextStepsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Next steps (optional)</h1>
        <p className="text-muted-foreground">
          If you want, here are a few ways to use the snapshot without adding more tools.
        </p>
      </div>

      {/* Action cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Run another snapshot */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Run another snapshot</CardTitle>
            </div>
            <CardDescription>Use a different time window or a new import.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard/connect">
                Start
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Save a copy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Save a copy</CardTitle>
            </div>
            <CardDescription>Download a simple view you can reference later.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print this page
            </Button>
          </CardContent>
        </Card>

        {/* Connect optional context */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Connect optional context</CardTitle>
            </div>
            <CardDescription>Calendar and CRM can add context later, but they're not required.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/connect">
                View connectors
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Share internally */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Share internally</CardTitle>
            </div>
            <CardDescription>
              If someone helps with scheduling or follow-up, you can share what you're seeing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Coming soon
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Closing line */}
      <Card className="border-muted">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground text-sm">
            Nothing here changes your tools. 2ndlook is a snapshot you can return to when you want.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
