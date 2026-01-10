import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  connectorLandingCopy,
  defaultConnectorCopy,
  reassuranceLine,
} from "@/config/connector-copy";

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
        <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-5xl">
          <Link href="/" className="text-xl font-semibold">
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
      <section className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="space-y-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
            {copy.heroTitle}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {copy.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
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
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-card border rounded-lg p-8">
          <h2 className="text-2xl font-semibold mb-6">What this shows</h2>
          <ul className="space-y-3">
            {copy.whatThisShows.map((item) => (
              <li key={item} className="flex items-start">
                <span className="text-primary mr-3 mt-1">•</span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What it doesn't do */}
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-card border rounded-lg p-8">
          <h2 className="text-2xl font-semibold mb-6">What it doesn't do</h2>
          <ul className="space-y-3">
            {copy.whatItDoesntDo.map((item) => (
              <li key={item} className="flex items-start">
                <span className="text-muted-foreground mr-3 mt-1">•</span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Reassurance */}
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <p className="text-center text-sm text-muted-foreground">
          {reassuranceLine}
        </p>
      </section>

      {/* Footer CTA */}
      <section className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-semibold">Ready to see what's there?</h2>
          <Link href="/dashboard/connect">
            <Button size="lg">
              Get a free 2nd Look
            </Button>
          </Link>
        </div>
      </section>

      {/* Simple footer */}
      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <p className="text-sm text-muted-foreground text-center">
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
    { tool: "servicetitan" },
    { tool: "quickbooks" },
    { tool: "square" },
    { tool: "joist" },
    { tool: "housecall-pro" },
  ];
}
