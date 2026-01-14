"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  wave: "Invoices and payments from Wave",
  "zoho-invoice": "Invoices from Zoho Invoice",
  quickbooks: "Invoices and payments from QuickBooks",
  jobber: "Estimates from Jobber",
  "housecall-pro": "Estimates from Housecall Pro",
};

const connectorPriority = [
  "jobber",
  "housecall-pro",
  "stripe",
  "square",
  "quickbooks",
  "wave",
  "zoho-invoice",
];

const oauthTools = [
  "jobber",
  "housecall-pro",
  "quickbooks",
  "square",
  "stripe",
  "wave",
  "zoho-invoice",
];

type ConnectionStatus = "connected" | "reconnect_required";

export default function ConnectPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionStatus>>({});
  const [jobberEvents, setJobberEvents] = useState<{
    last_sync_status: "success" | "fail" | null;
    last_error_message: string | null;
    last_event_id: string | null;
  } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const successParam = searchParams.get("success");
    
    if (errorParam) {
      setError(errorParam);
      setIsConnecting(false); // Connection failed
    }
    
    if (successParam === "true") {
      setIsConnecting(false); // Connection succeeded
    }
  }, [searchParams]);

  // Handle cleanup when leaving page or refreshing (for incomplete OAuth flows)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only disconnect if we were in the middle of connecting
      // and the connection wasn't completed (no success redirect)
      if (isConnecting && !searchParams.get("success")) {
        // Use sendBeacon for reliable cleanup during page unload
        const blob = new Blob([JSON.stringify({})], { type: "application/json" });
        navigator.sendBeacon("/api/oauth/jobber/disconnect", blob);
      }
    };

    const handleVisibilityChange = () => {
      // If user switches tabs/minimizes during connection, reset state
      if (document.visibilityState === "hidden" && isConnecting) {
        setIsConnecting(false);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isConnecting, searchParams]);

  useEffect(() => {
    let isMounted = true;

    const loadStatuses = async () => {
      try {
        const response = await fetch("/api/oauth/connections");
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted || !data?.connections) return;
        const statusMap: Record<string, ConnectionStatus> = {};
        for (const item of data.connections) {
          if (item?.provider && item?.status) {
            statusMap[item.provider] = item.status as ConnectionStatus;
          }
        }
        setConnectionStates(statusMap);
      } catch {
        // Silent failure - fallback to default UI
      }
    };

    loadStatuses();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadJobberEvents = async () => {
      try {
        const response = await fetch("/api/oauth/jobber/events");
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted) return;
        setJobberEvents({
          last_sync_status: data?.last_sync_status ?? null,
          last_error_message: data?.last_error_message ?? null,
          last_event_id: data?.last_event_id ?? null,
        });
      } catch {
        // Silent failure - fallback to default UI
      }
    };

    const checkJobberStatus = async () => {
      try {
        const response = await fetch("/api/oauth/jobber/status");
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted) return;
        
        // Update connection state based on status
        if (data.connected) {
          setConnectionStates(prev => ({ ...prev, jobber: "connected" }));
          setIsConnecting(false);
        } else if (data.status === "token_expired") {
          setConnectionStates(prev => ({ ...prev, jobber: "reconnect_required" }));
        }
      } catch {
        // Silent failure
      }
    };

    loadJobberEvents();
    checkJobberStatus();

    // Poll status every 30 seconds to detect disconnections
    const statusInterval = setInterval(checkJobberStatus, 30000);

    return () => {
      isMounted = false;
      clearInterval(statusInterval);
    };
  }, []);

  const connectors = useMemo(() => {
    const registry = listConnectors();
    const rank = (tool: string) => {
      const index = connectorPriority.indexOf(tool);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    return registry
      .filter(
        (connector) => connector.isImplemented && oauthTools.includes(connector.tool)
      )
      .slice()
      .sort((a, b) => rank(a.tool) - rank(b.tool));
  }, []);

  const getErrorMessage = (errorCode: string): string => {
    const count = searchParams.get("count");
    const required = searchParams.get("required") || "25";
    const errorMessages: Record<string, string> = {
      oauth_denied: "Authorization was canceled. Please try again when ready.",
      oauth_state_invalid: "Security validation failed. Please try connecting again.",
      oauth_exchange_failed: "Failed to complete OAuth exchange. Please try again.",
      oauth_scope_insufficient: "Your account does not have the required access. Please check scopes and try again.",
      oauth_provider_misconfigured: "OAuth configuration is missing. Please contact support.",
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

  const handleCopyEventId = async () => {
    if (!jobberEvents?.last_event_id) return;
    try {
      await navigator.clipboard.writeText(jobberEvents.last_event_id);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      const response = await fetch(`/api/oauth/${provider}/disconnect`, {
        method: "POST",
      });
      
      if (response.ok) {
        // Update UI state
        setConnectionStates(prev => {
          const newState = { ...prev };
          delete newState[provider];
          return newState;
        });
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
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
        <p className="text-sm text-muted-foreground">
          Need HoneyBook or ServiceTitan?{" "}
          <Link href="/dashboard/supported" className="underline underline-offset-2">
            Supported after onboarding
          </Link>
        </p>
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
          const status = connectionStates[connector.tool];
          const needsReconnect = status === "reconnect_required";
          const isConnected = status === "connected";
          const connectHref = `/api/oauth/${connector.tool}/start`;
          const reconnectHref = `/api/oauth/${connector.tool}/reconnect`;
          const manageHref = `/connectors/${connector.tool}`;

          return (
            <Card key={connector.tool} className="transition-colors hover:border-primary/70">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{connector.getDisplayName()}</CardTitle>
                  {needsReconnect ? (
                    <Badge variant="secondary" className="text-xs">
                      Reconnect required
                    </Badge>
                  ) : isConnected ? (
                    <Badge variant="default" className="text-xs">
                      Connected
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>
                  {description}
                  {needsReconnect && (
                    <span className="block text-xs text-muted-foreground">
                      Your connection needs to be refreshed.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {connector.tool === "jobber" && (
                  <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                    <div>
                      Last sync:{" "}
                      {jobberEvents?.last_sync_status
                        ? jobberEvents.last_sync_status === "success"
                          ? "Success"
                          : "Fail"
                        : "Never"}
                    </div>
                    <div>
                      Last error: {jobberEvents?.last_error_message || "None"}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Event ID: {jobberEvents?.last_event_id || "N/A"}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyEventId}
                        disabled={!jobberEvents?.last_event_id}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                {isConnected ? (
                  <div className="flex flex-col gap-2">
                    <Button asChild className="w-full">
                      <a href={manageHref}>Manage {connector.getDisplayName()}</a>
                    </Button>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="flex-1">
                        <a href={reconnectHref}>Reconnect</a>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleDisconnect(connector.tool)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : needsReconnect ? (
                  <Button asChild className="w-full">
                    <a 
                      href={reconnectHref}
                      onClick={() => setIsConnecting(true)}
                    >
                      Reconnect {connector.getDisplayName()}
                    </a>
                  </Button>
                ) : (
                  <Button asChild className="w-full">
                    <a 
                      href={connectHref}
                      onClick={() => setIsConnecting(true)}
                    >
                      Connect {connector.getDisplayName()}
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
