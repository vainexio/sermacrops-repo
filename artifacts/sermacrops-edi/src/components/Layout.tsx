import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Inbox, ArrowLeftRight,
  Globe, Building2, ScrollText, Menu, X, Zap, MoreHorizontal, Boxes
} from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/inbound", label: "Inbound", icon: Inbox },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/partners", label: "Endpoints", icon: Globe },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/logs", label: "Audit Logs", icon: ScrollText },
];

const bottomNav = nav.slice(0, 4);

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-sidebar border-r border-sidebar-border transition-transform duration-200 lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-blue-500">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sidebar-foreground font-semibold text-sm leading-tight tracking-tight">SERMACROPS</p>
            <p className="text-sidebar-foreground/50 text-[10px] uppercase tracking-widest">EDI Manager</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-sidebar-border">
          <p className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest">v1.0.0 · Production</p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 h-14 px-4 border-b border-border lg:hidden shrink-0">
          <button
            data-testid="btn-mobile-menu"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded hover:bg-muted"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-semibold text-sm">SERMACROPS EDI</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 bg-sidebar border-t border-sidebar-border lg:hidden">
          {bottomNav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 min-w-[56px]",
                  active ? "text-blue-500" : "text-sidebar-foreground/50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[56px] text-sidebar-foreground/50"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[9px] font-medium">More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
