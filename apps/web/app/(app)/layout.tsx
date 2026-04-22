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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <TopHeader />
      <main id="main-content" className="mx-auto max-w-lg px-4 py-4">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
