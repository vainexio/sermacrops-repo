import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListTransactions, getListTransactionsQueryKey,
  useGetTransaction, getGetTransactionQueryKey,
  useCreateTransaction,
  useUpdateTransaction,
  useListCompanies,
  useListEdiDocuments,
  updateEdiDocument,
} from "@workspace/api-client-react";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { ArrowLeftRight, ChevronDown, ChevronUp, Plus, Paperclip } from "lucide-react";

function TransactionDetail({
  detail,
  onAssign,
  onStatusChange,
}: {
  detail: NonNullable<ReturnType<typeof useGetTransaction>["data"]>;
  onAssign: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">{detail.referenceNumber}</h2>
          <p className="text-sm text-muted-foreground">{detail.initiatorName} · {detail.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {detail.totalValue != null && (
            <span className="text-lg font-bold text-foreground">${Number(detail.totalValue).toLocaleString()}</span>
          )}
          <StatusBadge status={detail.status} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={detail.status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Update status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={onAssign}>
          <Paperclip className="w-3 h-3" /> Assign Documents
        </Button>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-4 sm:p-5">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-4">Document Flow</h3>
        {detail.documents?.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents linked yet. Use "Assign Documents" to add some.</p>
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

function CreateTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: companies = [] } = useListCompanies();
  const { mutate: create, isPending, error } = useCreateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        onClose();
      },
    },
  });

  const [form, setForm] = useState({ referenceNumber: "", initiatorId: "", description: "", totalValue: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create({
      data: {
        referenceNumber: form.referenceNumber.trim(),
        initiatorId: form.initiatorId,
        description: form.description.trim() || undefined,
        totalValue: form.totalValue ? Number(form.totalValue) : undefined,
      },
    });
  }

  function handleClose() {
    setForm({ referenceNumber: "", initiatorId: "", description: "", totalValue: "" });
    onClose();
  }

  const apiError = (error as { data?: { error?: string } } | null)?.data?.error ?? (error ? String(error) : null);

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="refNum">Reference Number <span className="text-destructive">*</span></Label>
            <Input
              id="refNum"
              placeholder="e.g. PO-2024-001"
              value={form.referenceNumber}
              onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="initiator">Initiating Company <span className="text-destructive">*</span></Label>
            <Select value={form.initiatorId} onValueChange={v => setForm(f => ({ ...f, initiatorId: v }))}>
              <SelectTrigger id="initiator">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              placeholder="Optional description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="totalValue">Total Value</Label>
            <Input
              id="totalValue"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.totalValue}
              onChange={e => setForm(f => ({ ...f, totalValue: e.target.value }))}
            />
          </div>
          {apiError && <p className="text-sm text-destructive">{apiError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !form.referenceNumber || !form.initiatorId}>
              {isPending ? "Creating…" : "Create Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDocumentsDialog({
  open,
  transactionId,
  onClose,
}: {
  open: boolean;
  transactionId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: allDocs = [] } = useListEdiDocuments(undefined, { query: { enabled: open } });
  const unlinked = allDocs.filter(d => !d.transactionId);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { mutate: assign, isPending } = useMutation({
    mutationFn: async (docIds: string[]) => {
      await Promise.all(docIds.map(id => updateEdiDocument(id, { transactionId } as never)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(transactionId) });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setSelected(new Set());
      onClose();
    },
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Documents</DialogTitle>
        </DialogHeader>
        <div className="py-1">
          {unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No unassigned documents found. All existing documents are already linked to a transaction.
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {unlinked.map(doc => (
                <label
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggle(doc.id)}
                  />
                  <DocTypeBadge type={doc.documentType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.senderName} → {doc.receiverName}</p>
                    <p className="text-xs text-muted-foreground">{doc.referenceNumber ?? doc.id.slice(-8)}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </label>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button
            disabled={selected.size === 0 || isPending}
            onClick={() => assign(Array.from(selected))}
          >
            {isPending ? "Assigning…" : `Assign ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const params = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data: transactions, isLoading } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) },
  });

  const { data: detail } = useGetTransaction(selectedId!, {
    query: { enabled: !!selectedId, queryKey: getGetTransactionQueryKey(selectedId!) },
  });

  const { mutate: updateStatus } = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(selectedId!) });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(params) });
      },
    },
  });

  function toggle(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  function handleStatusChange(status: string) {
    if (!selectedId) return;
    updateStatus({ id: selectedId, data: { status } });
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col w-full lg:w-96 xl:w-[420px] border-r border-border shrink-0 overflow-y-auto">
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-foreground flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Transactions
            </h1>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3 h-3" /> New
            </Button>
          </div>
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
            <div className="p-8 text-center text-muted-foreground text-sm">
              No transactions yet.{" "}
              <button className="text-blue-500 hover:underline" onClick={() => setShowCreate(true)}>
                Create one
              </button>
            </div>
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

              {selectedId === tx.id && detail && (
                <div className="lg:hidden border-t border-border bg-background">
                  <TransactionDetail
                    detail={detail}
                    onAssign={() => setShowAssign(true)}
                    onStatusChange={handleStatusChange}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 hidden lg:block overflow-y-auto">
        {detail ? (
          <TransactionDetail
            detail={detail}
            onAssign={() => setShowAssign(true)}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <ArrowLeftRight className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-sm">Select a transaction to view its document flow</p>
          </div>
        )}
      </div>

      <CreateTransactionDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {selectedId && (
        <AssignDocumentsDialog
          open={showAssign}
          transactionId={selectedId}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}
