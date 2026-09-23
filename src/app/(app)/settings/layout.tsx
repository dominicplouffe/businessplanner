import { AppPageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "@/components/app/settings-tabs";

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
        <SettingsTabs tabs={TABS} />
        <div className="mt-8">{children}</div>
      </div>
    </>
  );
}
