import Link from "next/link";
import { AppPageHeader } from "@/components/app/page-header";

/* Two pages today, and a rail rather than a dropdown so adding team management
   later is a data change rather than a redesign. */
const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/billing", label: "Billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppPageHeader
        eyebrow="Account"
        title="Settings"
        lede="Your details, and what you have paid for."
      />
      <div className="px-6 py-8 sm:px-10">
        <nav aria-label="Settings sections" className="border-b border-hairline">
          <ul className="flex gap-6">
            {TABS.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className="-mb-px block border-b-2 border-transparent pb-3 text-sm text-secondary transition-colors hover:border-strong hover:text-primary"
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8">{children}</div>
      </div>
    </>
  );
}
