"use client";

import { ShieldCheck } from "lucide-react";
import { RequireStaff } from "@/components/guards";
import { Card } from "@/components/ui/Card";

export default function HeadPage() {
  return (
    <RequireStaff>
      <div className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-xl">
          <ShieldCheck aria-hidden className="h-6 w-6" />
          Head Prefect admin
        </h1>
        <Card className="p-6 text-sm text-muted">
          Notices, weather override, rules editing and user management arrive in
          later build phases. Access to this area is enforced by Firestore
          security rules, not by this page.
        </Card>
      </div>
    </RequireStaff>
  );
}
