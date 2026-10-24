"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  { label: "Overview", href: "/rider/dashboard", icon: "⌂" },
  { label: "Deliveries", href: "/rider/deliveries", icon: "▤" },
  { label: "Delivery History", href: "/rider/history", icon: "↻" },
  { label: "Earnings", href: "/rider/earnings", icon: "₦" },
  { label: "My Profile", href: "/rider/profile", icon: "◎" },
];

export function RiderSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setLogoutError("Unable to log out. Please try again.");
        setLoggingOut(false);
        return;
      }

      onNavigate?.();
      router.replace("/portal/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex min-h-full flex-col bg-white">
      <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
        <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-xl text-orange-700">
          <span aria-hidden="true">↗</span>
        </div>

        <div>
          <p className="text-base font-bold tracking-tight text-slate-900">
            LogisticApp
          </p>
          <p className="text-xs text-slate-500">Rider workspace</p>
        </div>
      </div>

      <nav aria-label="Rider navigation" className="flex-1 space-y-1 px-3 py-6">
        <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Workspace
        </p>

        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/rider/dashboard" &&
              pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? "bg-orange-50 text-orange-800"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-8 items-center justify-center rounded-lg text-lg ${
                  active
                    ? "bg-orange-100 text-orange-700"
                    : "text-slate-400 group-hover:text-slate-600"
                }`}
              >
                {item.icon}
              </span>

              <span>{item.label}</span>

              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-orange-600" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-4 border-t border-slate-100 p-4">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-red-50 text-lg"
          >
            ↪
          </span>
          {loggingOut ? "Logging out..." : "Log Out"}
        </button>

        {logoutError && (
          <p role="alert" className="text-xs text-red-700">
            {logoutError}
          </p>
        )}

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Need assistance?
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Contact support if you need help with your rider account or
            deliveries.
          </p>
        </div>
      </div>
    </aside>
  );
}
