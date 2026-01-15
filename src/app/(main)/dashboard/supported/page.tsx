import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const supportedAfterOnboarding = [
  {
    title: "HoneyBook",
    description: "Partner access or custom setup required.",
  },
  {
    title: "ServiceTitan",
    description: "Closed ecosystem integration with onboarding support.",
  },
  {
    title: "Custom CRMs",
    description: "We map your schema and connect via custom workflows.",
  },
];

export default function SupportedAfterOnboardingPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">Supported after onboarding</h1>
        <p className="text-muted-foreground">
          Some systems require partner access or custom setup. We connect these once we&apos;re working together.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {supportedAfterOnboarding.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </div>
  );
}
