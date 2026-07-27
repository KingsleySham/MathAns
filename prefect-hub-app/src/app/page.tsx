import Link from "next/link";
import { BookOpen, CloudSun, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/StatusBanner";

const SECTIONS = [
  {
    href: "/handbook",
    title: "Handbook",
    body: "Duty procedures, discipline and conduct, reporting lines — searchable.",
    Icon: BookOpen,
  },
  {
    href: "/simulations",
    title: "Simulations",
    body: "Practise emergency and discipline scenarios before they happen.",
    Icon: PlayCircle,
  },
  {
    href: "/portal",
    title: "Portal",
    body: "Live weather arrangements and notices from Head Prefects.",
    Icon: CloudSun,
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <StatusBanner />

      <section aria-label="Sections" className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className="group">
            <Card lift className="h-full p-5">
              <Icon aria-hidden className="mb-3 h-6 w-6 text-navy" />
              <h2 className="text-lg group-hover:underline">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
