import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  draft:         { label: "Draft",         classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  ready:         { label: "Ready",         classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  sent:          { label: "Sent",          classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  delivered:     { label: "Delivered",     classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  failed:        { label: "Failed",        classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  retry_pending: { label: "Retry",         classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
  received:      { label: "Received",      classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  processing:    { label: "Processing",    classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  processed:     { label: "Processed",     classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  error:         { label: "Error",         classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  open:          { label: "Open",          classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  in_progress:   { label: "In Progress",   classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  completed:     { label: "Completed",     classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  cancelled:     { label: "Cancelled",     classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pending:       { label: "Pending",       classes: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500" },
};

export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide", cfg.classes, className)}>
      {cfg.label}
    </span>
  );
}
