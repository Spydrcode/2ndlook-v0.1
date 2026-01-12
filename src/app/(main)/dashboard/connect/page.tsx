"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listConnectors } from "@/lib/connectors";
import { WINDOW_DAYS } from "@/lib/config/limits";

const connectorDescriptions: Record<string, string> = {
  stripe: "Invoices and payments from Stripe",
  square: "Invoices and payments from Square",
  paypal: "Invoices and payments from PayPal",
  wave: "Invoices and payments from Wave",
  "zoho-invoice": "Invoices from Zoho Invoice",
  paymo: "Billing from Paymo",
  quickbooks: "Invoices and payments from QuickBooks",
  jobber: "Estimates from Jobber",
  "housecall-pro": "Estimates from Housecall Pro",
};

const connectorPriority = [
  "stripe",
  "square",
  "paypal",
  "quickbooks",
  "wave",
  "zoho-invoice",
  "paymo",
  "jobber",
  "housecall-pro",
];

export default function ConnectPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(errorParam);
    }
  }, [searchParams]);

  const connectors = useMemo(() => {
    const registry = listConnectors();
    const rank = (tool: string) => {
      const index = connectorPriority.indexOf(tool);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    return registry.slice().sort((a, b) => rank(a.tool) - rank(b.tool));
  }, []);

  const getErrorMessage = (errorCode: string): string => {
    const count = searchParams.get("count");
    const required = searchParams.get("required") || "25";
    const errorMessages: Record<string, string> = {
      oauth_config_missing: "Jobber OAuth is not configured. Please contact your administrator to set up JOBBER_CLIENT_ID and JOBBER_REDIRECT_URI.",
      oauth_start_failed: "Failed to start OAuth flow. Please try again.",
      jobber_state_mismatch: "Security validation failed. Please try connecting again.",
      jobber_missing_code: "Authorization code was not received from Jobber. Please try again.",
      jobber_oauth_failed: "Jobber authorization failed. Please check your permissions and try again.",
      jobber_token_exchange_failed: "Failed to exchange authorization code for tokens. Please try again.",
      jobber_invalid_tokens: "Invalid tokens received from Jobber. Please try again.",
      jobber_db_error: "Failed to save connection details. Please try again.",
      jobber_ingest_failed: "Failed to fetch your estimates from Jobber. Please try again.",
      jobber_min_estimates: `Minimum 25 meaningful estimates required. Jobber returned fewer than 25 sent/accepted/converted estimates from the last ${WINDOW_DAYS} days.`,
      jobber_insufficient_data: `Connected to Jobber, but we found only ${count || 0} meaningful estimates. 2ndlook needs at least ${required} sent/accepted/converted estimates for a full snapshot. Create/send more estimates in Jobber, then reconnect.`,
      jobber_config_error: "OAuth configuration error. Please contact support.",
      jobber_unexpected_error: "An unexpected error occurred. Please try again.",
      oauth_not_implemented: "OAuth is not available for this connector yet.",
    };

    return errorMessages[errorCode] || "An error occurred connecting your account.";
  };

  const handleConnect = (tool: string, isImplemented: boolean) => {
    setError(null);

    if (!isImplemented) return;

    if (tool === "jobber") {
      window.location.href = "/api/oauth/jobber/start";
      return;
    }

    window.location.href = `/api/oauth/${tool}/start`;
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>One place to connect what you already use.</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your tools</h1>
        <p className="text-muted-foreground">
          Connect what you already use to generate a decision snapshot.
        </p>
        <p className="text-sm text-muted-foreground">Signal-only. No customer details. No line items.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{getErrorMessage(error)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-auto p-0 hover:bg-transparent"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {connectors.map((connector) => {
          const description = connectorDescriptions[connector.tool] || "Connect to see your signals.";
          const isAvailable = connector.isImplemented;

          return (
            <Card key={connector.tool} className="transition-colors hover:border-primary/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{connector.getDisplayName()}</CardTitle>
                  {!isAvailable && (
                    <Badge variant="secondary" className="text-xs">
                      Soon
                    </Badge>
                  )}
                </div>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant={isAvailable ? "default" : "outline"}
                  className="w-full"
                  disabled={!isAvailable}
                  onClick={() => handleConnect(connector.tool, isAvailable)}
                >
                  {isAvailable ? `Connect ${connector.getDisplayName()}` : "Coming soon"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
