import { AppProvider } from "@/contexts/app-context";
import { AppLayoutShell } from "./app-layout-shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppLayoutShell>{children}</AppLayoutShell>
    </AppProvider>
  );
}
