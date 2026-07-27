import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Table } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/StatusBanner";

export const metadata: Metadata = { title: "Portal" };

export default function PortalPage() {
  return (
    <div className="flex flex-col gap-6">
      <StatusBanner />

      <Link href="/portal/arrangements" className="group">
        <Card lift className="flex items-center gap-4 p-5">
          <Table aria-hidden className="h-6 w-6 shrink-0 text-navy" />
          <div>
            <h2 className="text-lg group-hover:underline">
              All weather arrangements
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              The full reference table — every signal, every duty rule.
            </p>
          </div>
        </Card>
      </Link>

      <section aria-label="Notices">
        <h2 className="mb-2 text-lg">Notices</h2>
        <Card className="flex items-center gap-4 p-5">
          <Megaphone aria-hidden className="h-6 w-6 shrink-0 text-navy" />
          <p className="text-sm text-muted">
            The notice feed from Head and Vice-Head Prefects arrives in the
            next build phase. Until then, keep an eye on the WhatsApp group.
          </p>
        </Card>
      </section>
    </div>
  );
}
