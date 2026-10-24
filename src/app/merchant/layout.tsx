"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MerchantSidebar } from "@/components/merchant/merchant-sidebar";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return <MerchantLayoutContent key={pathname}>{children}</MerchantLayoutContent>;
}

function MerchantLayoutContent({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Permanent sidebar on desktop */}
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <MerchantSidebar />
        </div>
      </div>

      <div className="min-w-0">
        {/* Compact mobile/tablet header */}
        <header className="sticky top-0 z-30 flex space-between h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="merchant-mobile-sidebar"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-lg font-bold text-orange-700">
              ↗
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">LogisticApp</p>
              <p className="text-xs text-slate-500">Merchant workspace</p>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>

      {/* Mobile/tablet navigation drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/45"
          />

          <aside
            id="merchant-mobile-sidebar"
            aria-label="Mobile merchant navigation"
            className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col bg-white shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <span className="font-bold text-slate-900">Navigation</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation menu"
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="size-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m6 6 12 12M18 6 6 18"
                  />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <MerchantSidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
