import { BottomNav } from "./components/BottomNav";
import { TopHeader } from "./components/TopHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-[calc(var(--nav-height)+var(--safe-area-bottom))]">
      <TopHeader />
      <main className="mx-auto max-w-lg px-4 py-4">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
