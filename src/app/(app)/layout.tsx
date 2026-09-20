import { AppSidebar } from "@/components/app/app-sidebar";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);

  const plans = await db.plan.findMany({
    where: { workspaceId: workspace.id, status: { not: "archived" } },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[16rem_1fr]">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-emerald-800 focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>

      <aside className="hidden border-r border-hairline bg-surface-sunken lg:block">
        <div className="sticky top-0 h-dvh">
          <AppSidebar user={{ name: user.name, email: user.email }} plans={plans} />
        </div>
      </aside>

      <main id="app-main" className="min-w-0">
        {children}
      </main>
    </div>
  );
}
