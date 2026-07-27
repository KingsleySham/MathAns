import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Handbook" };

export default function HandbookPage() {
  return (
    <Card className="p-8 text-center">
      <BookOpen aria-hidden className="mx-auto mb-3 h-8 w-8 text-navy" />
      <h1 className="text-xl">Handbook</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        The searchable Prefect&rsquo;s Handbook arrives in a later build phase.
        Until then, refer to the printed handbook and WhatsApp notices.
      </p>
    </Card>
  );
}
