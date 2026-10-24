"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  {
    label: "Overview",
    href: "/admin",
    icon: "◫",
    available: true,
  },
  {
    label: "Merchants",
    href: "/admin/merchants",
    icon: "▦",
    available: true,
  },
  {
    label: "Invitations",
    href: "/admin/invitations",
    icon: "✉",
    available: true,
  },
  {
    label: "Riders",
    href: "/admin/riders",
    icon: "♧",
    available: true,
  },
  {
    label: "Orders & deliveries",
    href: "/admin/orders",
    icon: "⇄",
    available: false,
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: "₦",
    available: false,
  },
  {
    label: "Notifications & audit",
    href: "/admin/audit",
    icon: "◎",
    available: false,
  },
  {
    label: "logout",
    href: "/admin/login",
    icon: "⇦",
    available: true,
  }
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-300">
      <div className="border-b border-white/10 px-5 py-6">
        <Link
          href="/admin"
          onClick={closeMobileMenu}
          className="flex items-center gap-3"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-xl font-bold text-white">
            L
          </span>

          <span>
            <span className="block text-base font-bold tracking-wide text-white">
              LOGISTIC
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">
              Administration
            </span>
          </span>
        </Link>
      </div>

      <div className="px-4 pb-2 pt-6">
        <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Workspace
        </p>
      </div>

      <nav
        aria-label="Admin navigation"
        className="flex-1 space-y-1 overflow-y-auto px-3 pb-5"
      >
        {navigation.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (!item.available) {
            return (
              <div
                key={item.label}
                title="This module has not been implemented yet"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500"
                aria-disabled="true"
              >
                <span className="flex h-6 w-6 items-center justify-center text-base">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
                <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={closeMobileMenu}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                active
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-950/30"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center text-base">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-xs font-medium text-slate-200">
              Admin workspace
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Restricted to authorized administrators.
          </p>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-700 font-bold text-white">
            L
          </span>
          <span className="text-sm font-bold text-slate-900">
            LOGISTIC ADMIN
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-700 hover:bg-slate-50"
        >
          {mobileOpen ? "×" : "☰"}
        </button>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeMobileMenu}
            className="absolute inset-0 bg-slate-950/50"
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
