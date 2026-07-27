import { PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Simulations" };

export default function SimulationsPage() {
  return (
    <Card className="p-8 text-center">
      <PlayCircle aria-hidden className="mx-auto mb-3 h-8 w-8 text-navy" />
      <h1 className="text-xl">Simulations</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Scenario training arrives in a later build phase.
      </p>
    </Card>
  );
}
