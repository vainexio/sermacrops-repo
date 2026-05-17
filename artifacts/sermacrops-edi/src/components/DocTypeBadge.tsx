import { cn } from "@/lib/utils";

const DOC_LABELS: Record<string, string> = {
  "850": "EDI 850 – Purchase Order",
  "855": "EDI 855 – PO Acknowledgment",
  "856": "EDI 856 – Ship Notice (ASN)",
  "810": "EDI 810 – Invoice",
  "204": "EDI 204 – Load Tender",
  "990": "EDI 990 – Load Response",
};

const DOC_COLORS: Record<string, string> = {
  "850": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  "855": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400",
  "856": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
  "810": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
  "204": "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  "990": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
};

export function docTypeLabel(type: string): string {
  return DOC_LABELS[type] ?? `EDI ${type}`;
}

export default function DocTypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", DOC_COLORS[type] ?? "bg-gray-100 text-gray-600", className)}>
      {DOC_LABELS[type] ?? `EDI ${type}`}
    </span>
  );
}
