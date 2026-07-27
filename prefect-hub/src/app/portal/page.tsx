import { CloudSun } from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Portal" };

export default function PortalPage() {
  return (
    <Card className="p-8 text-center">
      <CloudSun aria-hidden className="mx-auto mb-3 h-8 w-8 text-navy" />
      <h1 className="text-xl">Portal</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Live weather arrangements and the notice feed arrive with the weather
        engine phase.
      </p>
    </Card>
  );
}
