import { useState } from "react";
import { useListTransactions, getListTransactionsQueryKey, useGetTransaction, getGetTransactionQueryKey } from "@workspace/api-client-react";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ArrowLeftRight, ChevronDown, ChevronUp } from "lucide-react";

function TransactionDetail({ detail }: { detail: NonNullable<ReturnType<typeof useGetTransaction>["data"]> }) {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">{detail.referenceNumber}</h2>
          <p className="text-sm text-muted-foreground">{detail.initiatorName} · {detail.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {detail.totalValue != null && (
            <span className="text-lg font-bold text-foreground">${Number(detail.totalValue).toLocaleString()}</span>
          )}
          <StatusBadge status={detail.status} />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-4 sm:p-5">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-4">Document Flow</h3>
        {detail.documents?.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents linked to this transaction</p>
        )}
        <div className="space-y-2">
          {detail.documents?.map((doc, i) => (
            <div key={doc.id} data-testid={`tx-doc-${i}`} className="flex items-center gap-3 p-3 bg-muted/40 rounded hover:bg-muted/60 transition-colors flex-wrap">
              <span className="text-xs text-muted-foreground font-medium w-4 shrink-0">{i + 1}</span>
              <DocTypeBadge type={doc.documentType} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{doc.senderName} → {doc.receiverName}</p>
              </div>
              <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${doc.direction === "outbound" ? "bg-violet-100 text-violet-600" : "bg-cyan-100 text-cyan-600"}`}>
                {doc.direction}
              </span>
              <StatusBadge status={doc.status} />
              <Link href={`/documents/${doc.id}`} className="text-[10px] text-blue-500 hover:underline shrink-0">View</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = statusFilter !== "all" ? { status: statusFilter } : {};
  const { data: transactions, isLoading } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) },
  });

  const { data: detail } = useGetTransaction(selectedId!, {
    query: { enabled: !!selectedId, queryKey: getGetTransactionQueryKey(selectedId!) },
  });

  function toggle(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col w-full lg:w-96 xl:w-[420px] border-r border-border shrink-0 overflow-y-auto">
        <div className="p-4 space-y-3 border-b border-border">
          <h1 className="font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" /> Transactions
          </h1>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-tx-status" className="h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 divide-y divide-border">
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
          {!isLoading && transactions?.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No transactions found</div>
          )}
          {transactions?.map(tx => (
            <div key={tx.id}>
              <button
                data-testid={`tx-item-${tx.id}`}
                onClick={() => toggle(tx.id)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start justify-between gap-2 ${selectedId === tx.id ? "bg-muted" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{tx.referenceNumber}</span>
                    <StatusBadge status={tx.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{tx.initiatorName}</p>
                  {tx.totalValue != null && (
                    <p className="text-xs font-medium text-foreground mt-0.5">${Number(tx.totalValue).toLocaleString()}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <div className="lg:hidden shrink-0 mt-1 text-muted-foreground">
                  {selectedId === tx.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Inline mobile detail */}
              {selectedId === tx.id && detail && (
                <div className="lg:hidden border-t border-border bg-background">
                  <TransactionDetail detail={detail} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop right panel */}
      <div className="flex-1 hidden lg:block overflow-y-auto">
        {detail ? (
          <TransactionDetail detail={detail} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <ArrowLeftRight className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-sm">Select a transaction to view its document flow</p>
          </div>
        )}
      </div>
    </div>
  );
}
