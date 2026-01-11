"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Calendar, Users, ChevronDown, ChevronUp, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Connector {
  name: string;
  description: string;
  tool: string;
  enabled: boolean;
}

// ESTIMATES - Core (visible by default)
const ESTIMATES_CORE: Connector[] = [
  { name: "ServiceTitan", description: "Field service platform", tool: "servicetitan", enabled: true },
  { name: "Jobber", description: "Home service software", tool: "jobber", enabled: true },
  { name: "QuickBooks", description: "Accounting & estimates", tool: "quickbooks", enabled: true },
  { name: "Housecall Pro", description: "Service business platform", tool: "housecall-pro", enabled: true },
  { name: "Square", description: "Payments & invoicing", tool: "square", enabled: true },
  { name: "Joist", description: "Estimating & invoicing", tool: "joist", enabled: true },
];

// ESTIMATES - Secondary (show more)
const ESTIMATES_SECONDARY: Connector[] = [
  { name: "Stripe Invoicing", description: "Online invoicing", tool: "stripe-invoicing", enabled: false },
  { name: "PayPal Invoicing", description: "Invoice management", tool: "paypal-invoicing", enabled: false },
  { name: "Wave", description: "Accounting software", tool: "wave", enabled: false },
  { name: "Xero", description: "Cloud accounting", tool: "xero", enabled: false },
  { name: "FreshBooks", description: "Invoicing & accounting", tool: "freshbooks", enabled: false },
  { name: "Zoho Invoice", description: "Invoice software", tool: "zoho-invoice", enabled: false },
  { name: "Invoice Ninja", description: "Open-source invoicing", tool: "invoice-ninja", enabled: false },
  { name: "FieldEdge", description: "Field service management", tool: "fieldedge", enabled: false },
  { name: "Service Fusion", description: "Service business software", tool: "service-fusion", enabled: false },
  { name: "Kickserv", description: "Job management", tool: "kickserv", enabled: false },
  { name: "Markate", description: "Home service CRM", tool: "markate", enabled: false },
  { name: "Buildertrend", description: "Construction management", tool: "buildertrend", enabled: false },
  { name: "CoConstruct", description: "Custom builder software", tool: "coconstruct", enabled: false },
  { name: "Procore", description: "Construction platform", tool: "procore", enabled: false },
];

// CALENDAR - Core
const CALENDAR_CORE: Connector[] = [
  { name: "Google Calendar", description: "Google workspace", tool: "google-calendar", enabled: false },
  { name: "Outlook Calendar", description: "Microsoft 365", tool: "outlook", enabled: false },
  { name: "Apple Calendar", description: "iCloud calendar", tool: "apple-calendar", enabled: false },
];

// CALENDAR - Secondary
const CALENDAR_SECONDARY: Connector[] = [
  { name: "Calendly", description: "Scheduling platform", tool: "calendly", enabled: false },
  { name: "Cal.com", description: "Open-source scheduling", tool: "cal-com", enabled: false },
  { name: "Acuity Scheduling", description: "Online booking", tool: "acuity", enabled: false },
  { name: "Square Appointments", description: "Appointment booking", tool: "square-appointments", enabled: false },
  { name: "Jobber Schedule", description: "Job scheduling", tool: "jobber-schedule", enabled: false },
  { name: "Housecall Pro Schedule", description: "Appointment management", tool: "housecallpro-schedule", enabled: false },
  { name: "ServiceTitan Schedule", description: "Service scheduling", tool: "servicetitan-schedule", enabled: false },
];

// CRM - Core
const CRM_CORE: Connector[] = [
  { name: "HubSpot", description: "Marketing & CRM", tool: "hubspot", enabled: false },
  { name: "HighLevel", description: "All-in-one CRM", tool: "highlevel", enabled: false },
  { name: "Pipedrive", description: "Sales CRM", tool: "pipedrive", enabled: false },
];

// CRM - Secondary
const CRM_SECONDARY: Connector[] = [
  { name: "Salesforce", description: "Enterprise CRM", tool: "salesforce", enabled: false },
  { name: "Zoho CRM", description: "Customer management", tool: "zoho-crm", enabled: false },
  { name: "Monday CRM", description: "Work management CRM", tool: "monday-crm", enabled: false },
];

export default function ConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showMoreEstimates, setShowMoreEstimates] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showMoreCalendar, setShowMoreCalendar] = useState(false);
  const [showCRM, setShowCRM] = useState(false);
  const [showMoreCRM, setShowMoreCRM] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for error parameter in URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(errorParam);
    }
  }, [searchParams]);

  const getErrorMessage = (errorCode: string): string => {
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
      jobber_min_estimates: "Minimum 25 closed estimates required. Jobber returned fewer than 25 closed/accepted estimates from the last 90 days.",
      jobber_config_error: "OAuth configuration error. Please contact support.",
      jobber_unexpected_error: "An unexpected error occurred. Please try again.",
    };

    return errorMessages[errorCode] || "An error occurred connecting your account.";
  };

  const handleConnect = (tool: string) => {
    // Clear any existing errors
    setError(null);
    
    // OAuth-based connectors redirect to OAuth flow
    if (tool === "jobber") {
      window.location.href = "/api/oauth/jobber/start";
      return;
    }
    
    // File-based connectors go to import page
    router.push(`/dashboard/import?category=estimates&tool=${tool}`);
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Connect Your Tools</h1>
        <p className="text-muted-foreground">
          Connect your estimating tool to create a snapshot of recent patterns.
        </p>
        <p className="text-sm text-muted-foreground">
          Closed estimates only. No customer or line-item details.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
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

      {/* ESTIMATES (PRIMARY - ALWAYS EXPANDED) */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Estimates</h2>
          <p className="text-sm text-muted-foreground">
            Connect your estimating tool to include recent closed estimates
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ESTIMATES_CORE.map((connector) => (
            <Card
              key={connector.tool}
              className="cursor-pointer transition-colors hover:border-primary"
            >
              <CardHeader>
                <CardTitle className="text-base">{connector.name}</CardTitle>
                <CardDescription>{connector.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleConnect(connector.tool)}
                >
                  Connect {connector.name}
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Upload file option */}
          <Card className="cursor-pointer border-dashed transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileUp className="h-4 w-4" />
                Upload File
              </CardTitle>
              <CardDescription>Import from exported data</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleConnect("file")}
              >
                Upload File
              </Button>
            </CardContent>
          </Card>

          {/* Secondary estimates (show more) */}
          {showMoreEstimates &&
            ESTIMATES_SECONDARY.map((connector) => (
              <Card key={connector.tool} className="opacity-60">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{connector.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      Soon
                    </Badge>
                  </div>
                  <CardDescription>{connector.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" disabled>
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setShowMoreEstimates(!showMoreEstimates)}
        >
          {showMoreEstimates ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 h-4 w-4" />
              Show More Connectors ({ESTIMATES_SECONDARY.length})
            </>
          )}
        </Button>
      </div>

      {/* CALENDAR (OPTIONAL - COLLAPSED BY DEFAULT) */}
      <Collapsible open={showCalendar} onOpenChange={setShowCalendar}>
        <div className="space-y-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-medium">Calendar</h2>
                <Badge variant="secondary">Optional</Badge>
              </div>
              {showCalendar ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Calendar connections are not required for v0.1
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {CALENDAR_CORE.map((connector) => (
                <Card key={connector.tool} className="opacity-60">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{connector.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        Soon
                      </Badge>
                    </div>
                    <CardDescription>{connector.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {showMoreCalendar &&
                CALENDAR_SECONDARY.map((connector) => (
                  <Card key={connector.tool} className="opacity-60">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{connector.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          Soon
                        </Badge>
                      </div>
                      <CardDescription>{connector.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full" disabled>
                        Coming Soon
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowMoreCalendar(!showMoreCalendar)}
            >
              {showMoreCalendar ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Show More Connectors ({CALENDAR_SECONDARY.length})
                </>
              )}
            </Button>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* CRM (OPTIONAL - COLLAPSED BY DEFAULT) */}
      <Collapsible open={showCRM} onOpenChange={setShowCRM}>
        <div className="space-y-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-medium">CRM</h2>
                <Badge variant="secondary">Optional</Badge>
              </div>
              {showCRM ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              CRM connections will be available in a future release
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {CRM_CORE.map((connector) => (
                <Card key={connector.tool} className="opacity-60">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{connector.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        Soon
                      </Badge>
                    </div>
                    <CardDescription>{connector.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" disabled>
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {showMoreCRM &&
                CRM_SECONDARY.map((connector) => (
                  <Card key={connector.tool} className="opacity-60">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{connector.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          Soon
                        </Badge>
                      </div>
                      <CardDescription>{connector.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full" disabled>
                        Coming Soon
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowMoreCRM(!showMoreCRM)}
            >
              {showMoreCRM ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Show More Connectors ({CRM_SECONDARY.length})
                </>
              )}
            </Button>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
