import { useState } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Activity } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  created: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  updated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  send_failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  send_error: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function Logs() {
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");

  const params = entityTypeFilter !== "all" ? { entityType: entityTypeFilter } : {};
  const { data: logs, isLoading } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params) },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="w-5 h-5" /> Audit Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Complete audit trail of all EDI operations</p>
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger data-testid="select-log-entity-type" className="w-48">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="EdiDocument">EDI Document</SelectItem>
            <SelectItem value="Company">Company</SelectItem>
            <SelectItem value="PartnerEndpoint">Partner Endpoint</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 bg-muted/40 border-b border-border grid grid-cols-12 gap-4">
          <span className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Action</span>
          <span className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Entity Type</span>
          <span className="col-span-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Entity ID</span>
          <span className="col-span-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Details</span>
          <span className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</span>
        </div>

        {isLoading && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-border animate-pulse">
            <div className="h-3 bg-muted rounded w-full" />
          </div>
        ))}

        {!isLoading && logs?.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            <Activity className="w-10 h-10 opacity-20 mx-auto mb-3" />
            <p>No audit logs yet</p>
          </div>
        )}

        <div className="divide-y divide-border">
          {logs?.map(log => {
            const details = (() => { try { return log.details ? JSON.parse(log.details) : null; } catch { return null; } })();
            return (
              <div key={log.id} data-testid={`log-row-${log.id}`} className="px-5 py-3 grid grid-cols-12 gap-4 items-center hover:bg-muted/30 transition-colors">
                <div className="col-span-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                    {log.action}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-foreground font-medium">{log.entityType}</span>
                </div>
                <div className="col-span-3">
                  <span className="text-xs font-mono text-muted-foreground truncate block">{log.entityId}</span>
                </div>
                <div className="col-span-3">
                  {details ? (
                    <span className="text-xs text-muted-foreground truncate block">
                      {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
