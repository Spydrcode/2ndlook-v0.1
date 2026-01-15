import Link from "next/link";

import { Button } from "@/components/ui/button";
import { connectorLandingCopy, defaultConnectorCopy, reassuranceLine } from "@/config/connector-copy";

interface ConnectorPageProps {
  params: {
    tool: string;
  };
}

export default function ConnectorPage({ params }: ConnectorPageProps) {
  const { tool } = params;

  // Get copy for this tool or use default
  const copy = connectorLandingCopy[tool] || defaultConnectorCopy;

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header */}
      <header className="border-b">
        <div className="container mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-xl">
            2ndlook
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto max-w-4xl px-4 py-16">
        <div className="space-y-6 text-center">
          <h1 className="font-bold text-4xl leading-tight tracking-tight md:text-5xl">{copy.heroTitle}</h1>
          <p className="mx-auto max-w-2xl text-muted-foreground text-xl">{copy.heroSubtitle}</p>
          <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
            <Link href="/dashboard/connect">
              <Button size="lg" className="w-full sm:w-auto">
                Get a free 2nd Look
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Go to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What this shows */}
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg border bg-card p-8">
          <h2 className="mb-6 font-semibold text-2xl">What this shows</h2>
          <ul className="space-y-3">
            {copy.whatThisShows.map((item) => (
              <li key={item} className="flex items-start">
                <span className="mt-1 mr-3 text-primary">•</span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What it doesn't do */}
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg border bg-card p-8">
          <h2 className="mb-6 font-semibold text-2xl">What it doesn't do</h2>
          <ul className="space-y-3">
            {copy.whatItDoesntDo.map((item) => (
              <li key={item} className="flex items-start">
                <span className="mt-1 mr-3 text-muted-foreground">•</span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Reassurance */}
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <p className="text-center text-muted-foreground text-sm">{reassuranceLine}</p>
      </section>

      {/* Footer CTA */}
      <section className="container mx-auto max-w-4xl px-4 py-16">
        <div className="space-y-6 text-center">
          <h2 className="font-semibold text-3xl">Ready to see what's there?</h2>
          <Link href="/dashboard/connect">
            <Button size="lg">Get a free 2nd Look</Button>
          </Link>
        </div>
      </section>

      {/* Simple footer */}
      <footer className="mt-16 border-t">
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <p className="text-center text-muted-foreground text-sm">
            © 2026 2ndlook. Built for founders who carry the numbers.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Generate static params for known connectors
export function generateStaticParams() {
  return [
    { tool: "jobber" },
    { tool: "housecall-pro" },
    { tool: "stripe" },
    { tool: "square" },
    { tool: "paypal" },
    { tool: "wave" },
    { tool: "zoho-invoice" },
    { tool: "paymo" },
    { tool: "quickbooks" },
  ];
}
