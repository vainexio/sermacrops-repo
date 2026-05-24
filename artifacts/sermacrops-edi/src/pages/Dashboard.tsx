import { useGetDashboardSummary, useGetRecentActivity, useGetDocumentStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import {
  FileText, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle,
  Clock, Activity, TrendingUp, RefreshCw, Package, Percent,
} from "lucide-react";
import { Link } from "wouter";
import { apiBase } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusBreakdown { status: string; count: number }
interface StatsData { breakdown: StatusBreakdown[]; total: number }
interface TimelineDay { date: string; inbound: number; outbound: number; total: number }

// ─── Colour palettes ──────────────────────────────────────────────────────────

const TX_COLORS: Record<string, string> = {
  open:        "#3b82f6",
  in_progress: "#f59e0b",
  completed:   "#10b981",
  cancelled:   "#6b7280",
};

const PO_COLORS: Record<string, string> = {
  open:         "#3b82f6",
  acknowledged: "#8b5cf6",
  received:     "#06b6d4",
  billing:      "#f97316",
  completed:    "#10b981",
};

const LABEL_MAP: Record<string, string> = {
  open: "Open", in_progress: "In Progress", completed: "Completed",
  cancelled: "Cancelled", acknowledged: "Acknowledged",
  received: "Received", billing: "Billing",
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide leading-none">{label}</p>
        <p className="text-2xl font-bold mt-1.5 text-foreground leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className={`p-2 rounded-lg shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4 animate-pulse flex items-start justify-between gap-3">
      <div className="space-y-2 flex-1">
        <div className="h-2.5 bg-muted rounded w-24" />
        <div className="h-7 bg-muted rounded w-14 mt-2" />
      </div>
      <div className="w-8 h-8 bg-muted rounded-lg shrink-0" />
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({
  data, colors, total, title, isLoading,
}: {
  data: StatusBreakdown[]; colors: Record<string, string>;
  total: number; title: string; isLoading: boolean;
}) {
  const chartData = data.filter(d => d.count > 0);

  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">{title}</h2>
      {isLoading ? (
        <div className="flex gap-4 items-center animate-pulse">
          <div className="w-36 h-36 rounded-full bg-muted shrink-0" />
          <div className="space-y-2 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-muted shrink-0" />
                <div className="h-3 bg-muted rounded flex-1" />
              </div>
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <div className="flex items-center justify-center h-36 text-sm text-muted-foreground">No data yet</div>
      ) : (
        <div className="flex gap-4 items-center">
          <div className="shrink-0">
            <PieChart width={140} height={140}>
              <Pie data={chartData} dataKey="count" nameKey="status" cx="50%" cy="50%"
                innerRadius={42} outerRadius={65} paddingAngle={2} strokeWidth={0}>
                {chartData.map(entry => (
                  <Cell key={entry.status} fill={colors[entry.status] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: number, name: string) => [val, LABEL_MAP[name] ?? name]}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
            </PieChart>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {chartData.map(d => (
              <div key={d.status} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[d.status] ?? "#94a3b8" }} />
                  <span className="text-muted-foreground truncate">{LABEL_MAP[d.status] ?? d.status}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-semibold text-foreground">{d.count}</span>
                  <span className="text-muted-foreground">({Math.round((d.count / total) * 100)}%)</span>
                </div>
              </div>
            ))}
            <div className="pt-1 border-t border-border/50 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-foreground">{total}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: docStats, isLoading: loadingDocStats } = useGetDocumentStats();

  const { data: txStats, isLoading: loadingTx } = useQuery<StatsData>({
    queryKey: ["dashboard-tx-stats"],
    queryFn: () => fetch(`${apiBase}/api/dashboard/transaction-stats`).then(r => r.json()),
  });

  const { data: poStats, isLoading: loadingPo } = useQuery<StatsData>({
    queryKey: ["dashboard-po-stats"],
    queryFn: () => fetch(`${apiBase}/api/dashboard/procurement-stats`).then(r => r.json()),
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery<TimelineDay[]>({
    queryKey: ["dashboard-doc-timeline"],
    queryFn: () => fetch(`${apiBase}/api/dashboard/doc-timeline`).then(r => r.json()),
  });

  const deliveryRate = summary && summary.totalDocuments > 0
    ? Math.round((summary.deliveredCount / summary.totalDocuments) * 100)
    : 0;

  const completedTx = txStats?.breakdown.find(b => b.status === "completed")?.count ?? 0;
  const activePo = poStats?.breakdown.filter(b => ["open", "acknowledged", "received", "billing"].includes(b.status))
    .reduce((s, b) => s + b.count, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">EDI Operations Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">SERMACROPS Manufacturing — Real-time EDI analytics</p>
      </div>

      {/* Stat cards — row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loadingSummary ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary ? (
          <>
            <StatCard label="Total Documents" value={summary.totalDocuments} icon={FileText} color="bg-blue-100 text-blue-600" />
            <StatCard label="Delivered" value={summary.deliveredCount} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" />
            <StatCard label="Failed" value={summary.failedCount} icon={AlertCircle} color="bg-red-100 text-red-600" />
            <StatCard label="Pending" value={summary.pendingCount} icon={Clock} color="bg-amber-100 text-amber-600" />
            <StatCard label="Retry Queue" value={(summary as { pendingCount: number; failedCount: number } & typeof summary).pendingCount} icon={RefreshCw} color="bg-orange-100 text-orange-600" />
            <StatCard label="Delivery Rate" value={`${deliveryRate}%`} icon={Percent} color="bg-violet-100 text-violet-600" />
          </>
        ) : null}
      </div>

      {/* Stat cards — row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loadingSummary ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary ? (
          <>
            <StatCard label="Outbound" value={summary.outboundCount} sub="documents sent" icon={ArrowUpRight} color="bg-violet-100 text-violet-600" />
            <StatCard label="Inbound" value={summary.inboundCount} sub="documents received" icon={ArrowDownLeft} color="bg-cyan-100 text-cyan-600" />
            <StatCard
              label="Active Transactions"
              value={summary.activeTransactions}
              sub={`${completedTx} completed`}
              icon={Activity}
              color="bg-indigo-100 text-indigo-600"
            />
            <StatCard
              label="Open Procurement"
              value={activePo}
              sub={`${poStats?.breakdown.find(b => b.status === "completed")?.count ?? 0} completed`}
              icon={Package}
              color="bg-teal-100 text-teal-600"
            />
          </>
        ) : null}
      </div>

      {/* Charts row 1: Timeline + Doc Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7-Day Document Timeline */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">7-Day Document Activity</h2>
          {loadingTimeline ? (
            <div className="flex items-end gap-2 h-52 animate-pulse">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col gap-1 justify-end">
                  <div className="bg-muted rounded-sm" style={{ height: `${20 + i * 12}px` }} />
                  <div className="h-2.5 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : timeline && timeline.some(d => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={timeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="inbound" name="Inbound" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="total" name="Total" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">No documents in the last 7 days</div>
          )}
        </div>

        {/* Document Volume by Type */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Document Volume by Type</h2>
          {loadingDocStats ? (
            <div className="flex items-end gap-3 h-52 px-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                  <div className="bg-muted rounded-sm" style={{ height: `${30 + (i % 3) * 40}px` }} />
                  <div className="h-2.5 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : docStats && docStats.some(s => s.total > 0) ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={docStats.map(s => ({ name: `EDI ${s.documentType}`, delivered: s.delivered, failed: s.failed, pending: s.total - s.delivered - s.failed }))}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" name="Pending" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">No document data yet</div>
          )}
        </div>
      </div>

      {/* Charts row 2: Transaction donut + Procurement donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DonutChart
          title="Transaction Status Breakdown"
          data={txStats?.breakdown ?? []}
          colors={TX_COLORS}
          total={txStats?.total ?? 0}
          isLoading={loadingTx}
        />
        <DonutChart
          title="Procurement Order Status"
          data={poStats?.breakdown ?? []}
          colors={PO_COLORS}
          total={poStats?.total ?? 0}
          isLoading={loadingPo}
        />
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
              <div key={item.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors">
                <DocTypeBadge type={item.documentType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.senderName} → {item.receiverName}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.referenceNumber ?? item.id.slice(-8)} · {item.direction}</p>
                </div>
                {item.totalAmount != null && (
                  <span className="text-xs sm:text-sm font-semibold text-foreground shrink-0">
                    PHP {Number(item.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
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
