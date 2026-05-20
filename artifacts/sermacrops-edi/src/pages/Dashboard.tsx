import { useGetDashboardSummary, useGetOrderTocashFlow, useGetRecentActivity, useGetDocumentStats } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { FileText, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, Clock, Activity } from "lucide-react";
import { Link } from "wouter";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`} className="bg-card border border-card-border rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold mt-1 text-foreground">{value.toLocaleString()}</p>
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-8 bg-muted rounded w-16 mt-2" />
        </div>
        <div className="w-9 h-9 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

const FLOW_STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-500",
  in_progress: "bg-amber-400",
  failed: "bg-red-500",
  pending: "bg-gray-300 dark:bg-gray-600",
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: flow, isLoading: loadingFlow } = useGetOrderTocashFlow();
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: docStats, isLoading: loadingDocStats } = useGetDocumentStats();

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">EDI Operations Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">SERMACROPS Manufacturing — Order-to-Cash Process Monitor</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingSummary ? (
          Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary ? (
          <>
            <StatCard label="Total Documents" value={summary.totalDocuments} icon={FileText} color="bg-blue-100 text-blue-600" />
            <StatCard label="Outbound" value={summary.outboundCount} icon={ArrowUpRight} color="bg-violet-100 text-violet-600" />
            <StatCard label="Inbound" value={summary.inboundCount} icon={ArrowDownLeft} color="bg-cyan-100 text-cyan-600" />
            <StatCard label="Delivered" value={summary.deliveredCount} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" />
            <StatCard label="Failed" value={summary.failedCount} icon={AlertCircle} color="bg-red-100 text-red-600" />
            <StatCard label="Pending" value={summary.pendingCount} icon={Clock} color="bg-amber-100 text-amber-600" />
            <StatCard label="Active Transactions" value={summary.activeTransactions} icon={Activity} color="bg-indigo-100 text-indigo-600" />
            <StatCard label="Companies" value={summary.companiesCount} icon={FileText} color="bg-slate-100 text-slate-600" />
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order-to-Cash Flow */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Order-to-Cash Flow</h2>
          <div className="space-y-2">
            {loadingFlow ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                  <div className="w-14 h-5 bg-muted rounded" />
                  <div className="w-16 h-5 bg-muted rounded" />
                </div>
              ))
            ) : flow?.length ? (
              flow.map((step, i) => (
                <div key={i} data-testid={`flow-step-${step.sequenceOrder}`} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-[10px] font-bold shrink-0">
                    {step.sequenceOrder}
                  </div>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${FLOW_STATUS_COLOR[step.status] ?? "bg-gray-300"}`} />
                    <span className="text-xs text-muted-foreground truncate">{step.sender} → {step.receiver}</span>
                  </div>
                  <DocTypeBadge type={step.documentType} />
                  <StatusBadge status={step.status} />
                  {step.documentId && (
                    <Link href={`/documents/${step.documentId}`} className="text-[10px] text-blue-500 hover:underline shrink-0">View</Link>
                  )}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-sm text-center py-4">No flow data yet</div>
            )}
          </div>
        </div>

        {/* Document Stats Chart */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Document Volume by Type</h2>
          {loadingDocStats ? (
            <div className="flex items-end gap-3 h-56 px-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                  <div className="bg-muted rounded-sm" style={{ height: `${30 + (i % 3) * 40}px` }} />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : docStats && docStats.some(s => s.total > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={docStats.map(s => ({ name: `EDI ${s.documentType}`, total: s.total, delivered: s.delivered, failed: s.failed }))}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="delivered" name="Delivered" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="hsl(0 84% 60%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="hsl(221 83% 53% / 0.3)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
              No document data yet. <Link href="/documents/new" className="ml-1 text-blue-500 hover:underline">Create a document</Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Recent Activity</h2>
          <Link href="/documents" className="text-xs text-blue-500 hover:underline">View all</Link>
        </div>
        <div className="divide-y divide-border">
          {loadingActivity ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3 animate-pulse">
                <div className="w-14 h-5 bg-muted rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-48" />
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
                <div className="w-16 h-5 bg-muted rounded" />
                <div className="hidden sm:block w-28 h-3 bg-muted rounded" />
              </div>
            ))
          ) : activity?.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">No recent activity</div>
          ) : (
            activity?.slice(0, 10).map(item => (
              <div key={item.id} data-testid={`activity-item-${item.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors">
                <DocTypeBadge type={item.documentType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.senderName} → {item.receiverName}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.referenceNumber ?? item.id.slice(-8)} · {item.direction}</p>
                </div>
                {item.totalAmount != null && (
                  <span className="text-xs sm:text-sm font-semibold text-foreground shrink-0">${item.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                )}
                <StatusBadge status={item.status} />
                <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
