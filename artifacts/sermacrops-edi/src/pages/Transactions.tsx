import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListTransactions, getListTransactionsQueryKey,
  useGetTransaction, getGetTransactionQueryKey, getListEdiDocumentsQueryKey,
  useCreateTransaction,
  useUpdateTransaction,
  useListCompanies,
  useListEdiDocuments,
  updateEdiDocument,
  type Transaction,
  type EdiDocument,
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
import {
  ArrowLeftRight, ChevronDown, ChevronUp, Plus, Paperclip,
  CheckCircle2, XCircle, Clock, Circle, ArrowRight,
  ShoppingCart, FileCheck, Truck, CheckSquare, Package, Receipt,
} from "lucide-react";

// ─── Order-to-Cash step definitions ──────────────────────────────────────────

const O2C_STEPS = [
  {
    step: 1, ediType: "850", direction: "inbound" as const,
    label: "Purchase Order", from: "Coffee Shop", to: "SERMACROPS",
    description: "Customer sends purchase order",
    Icon: ShoppingCart,
  },
  {
    step: 2, ediType: "855", direction: "outbound" as const,
    label: "PO Acknowledgment", from: "SERMACROPS", to: "Coffee Shop",
    description: "Acknowledge the purchase order",
    Icon: FileCheck,
  },
  {
    step: 3, ediType: "204", direction: "outbound" as const,
    label: "Load Tender", from: "SERMACROPS", to: "Logistics",
    description: "Arrange transportation",
    Icon: Truck,
  },
  {
    step: 4, ediType: "990", direction: "inbound" as const,
    label: "Load Response", from: "Logistics", to: "SERMACROPS",
    description: "Logistics confirms acceptance",
    Icon: CheckSquare,
  },
  {
    step: 5, ediType: "850", direction: "outbound" as const,
    label: "Purchase Order", from: "SERMACROPS", to: "Supplier",
    description: "Order raw materials from supplier",
    Icon: ShoppingCart,
  },
  {
    step: 6, ediType: "855", direction: "inbound" as const,
    label: "PO Acknowledgment", from: "Supplier", to: "SERMACROPS",
    description: "Supplier confirms receipt",
    Icon: FileCheck,
  },
  {
    step: 7, ediType: "856", direction: "outbound" as const,
    label: "Ship Notice (ASN)", from: "SERMACROPS", to: "Coffee Shop",
    description: "Forward shipment notification to customer",
    Icon: Package,
  },
  {
    step: 8, ediType: "810", direction: "outbound" as const,
    label: "Invoice", from: "SERMACROPS", to: "Coffee Shop",
    description: "Send invoice for payment",
    Icon: Receipt,
  },
] as const;

type O2CStep = typeof O2C_STEPS[number];
type EdiDoc = EdiDocument;

type StepStatus = "completed" | "failed" | "in_progress" | "draft" | "next" | "pending";

function getDocStatus(doc: EdiDoc): "completed" | "failed" | "in_progress" | "draft" {
  if (doc.status === "delivered") return "completed";
  if (doc.status === "failed") return "failed";
  if (doc.status === "sent" || doc.status === "ready" || doc.status === "retry_pending") return "in_progress";
  return "draft";
}

function matchDocForStep(step: O2CStep, docs: EdiDoc[]): EdiDoc | null {
  return docs.find(d => d.documentType === step.ediType && d.direction === step.direction) ?? null;
}

function getStepStatus(step: O2CStep, docs: EdiDoc[], index: number): StepStatus {
  const doc = matchDocForStep(step, docs);
  if (doc) return getDocStatus(doc);
  // Mark as "next" if all previous steps with docs are completed
  const prevDone = O2C_STEPS.slice(0, index).every(s => {
    const d = matchDocForStep(s, docs);
    return d && getDocStatus(d) === "completed";
  });
  return prevDone ? "next" : "pending";
}

// ─── Step circle indicator ────────────────────────────────────────────────────

function StepCircle({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
        <CheckCircle2 className="w-5 h-5 text-white" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0 shadow-sm">
        <XCircle className="w-5 h-5 text-white" />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0 shadow-sm">
        <Clock className="w-5 h-5 text-white" />
      </div>
    );
  }
  if (status === "draft") {
    return (
      <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow-sm">
        <Circle className="w-4 h-4 text-white fill-white" />
      </div>
    );
  }
  if (status === "next") {
    return (
      <div className="w-8 h-8 rounded-full border-2 border-blue-400 bg-blue-50 flex items-center justify-center shrink-0 animate-pulse">
        <ArrowRight className="w-4 h-4 text-blue-500" />
      </div>
    );
  }
  // pending
  return (
    <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center shrink-0">
      <Circle className="w-3 h-3 text-muted-foreground/40" />
    </div>
  );
}

// ─── O2C Flow Stepper ─────────────────────────────────────────────────────────

function O2CFlowStepper({ documents }: { documents: EdiDoc[] }) {
  const completedCount = O2C_STEPS.filter(s => {
    const doc = matchDocForStep(s, documents);
    return doc && getDocStatus(doc) === "completed";
  }).length;

  const progressPct = Math.round((completedCount / O2C_STEPS.length) * 100);

  return (
    <div>
      {/* Progress summary */}
      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium">{completedCount} of {O2C_STEPS.length} steps complete</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="relative">
        {O2C_STEPS.map((step, index) => {
          const doc = matchDocForStep(step, documents);
          const status = getStepStatus(step, documents, index);
          const isLast = index === O2C_STEPS.length - 1;
          const { Icon } = step;

          return (
            <div key={step.step} className="flex gap-3">
              {/* Left: circle + connector */}
              <div className="flex flex-col items-center">
                <StepCircle status={status} />
                {!isLast && (
                  <div className={`w-0.5 flex-1 my-1 min-h-[2rem] rounded-full ${status === "completed" ? "bg-emerald-300" : "bg-border"}`} />
                )}
              </div>

              {/* Right: step content */}
              <div className={`flex-1 pb-5 ${isLast ? "" : ""}`}>
                <div className={`rounded-lg border p-3 transition-colors ${
                  status === "completed" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900" :
                  status === "failed" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900" :
                  status === "in_progress" ? "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900" :
                  status === "next" ? "border-blue-200 bg-background" :
                  "border-border/50 bg-muted/20"
                }`}>
                  {/* Step header */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${
                        status === "completed" ? "text-emerald-600" :
                        status === "failed" ? "text-red-500" :
                        status === "in_progress" ? "text-blue-500" :
                        "text-muted-foreground"
                      }`} />
                      <span className={`text-xs font-semibold ${status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                        Step {step.step} · {step.label}
                      </span>
                    </div>
                    <DocTypeBadge type={step.ediType} />
                  </div>

                  {/* Direction */}
                  <p className={`text-xs mb-2 ${status === "pending" ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                    {step.from} <span className="mx-1">→</span> {step.to}
                  </p>

                  {/* Doc info if present */}
                  {doc ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground shrink-0">
                        {doc.senderName} → {doc.receiverName}
                      </p>
                      <div className="flex items-center gap-2 ml-auto">
                        <StatusBadge status={doc.status} />
                        {doc.sentAt && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(doc.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        <Link href={`/documents/${doc.id}`} className="text-[10px] text-blue-500 hover:underline shrink-0 font-medium">
                          View →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/60 italic">{step.description}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Extra documents not matched to any O2C step */}
      {(() => {
        const matchedIds = new Set(
          O2C_STEPS.map(s => matchDocForStep(s, documents)?.id).filter(Boolean)
        );
        const extras = documents.filter(d => !matchedIds.has(d.id));
        if (extras.length === 0) return null;
        return (
          <div className="mt-2 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Other Documents</p>
            <div className="space-y-2">
              {extras.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded border border-border/50 flex-wrap">
                  <DocTypeBadge type={doc.documentType} />
                  <p className="text-xs text-foreground flex-1 min-w-0 truncate">{doc.senderName} → {doc.receiverName}</p>
                  <StatusBadge status={doc.status} />
                  <Link href={`/documents/${doc.id}`} className="text-[10px] text-blue-500 hover:underline">View →</Link>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Transaction Detail Panel ─────────────────────────────────────────────────

function TransactionDetail({
  detail,
  onAssign,
  onStatusChange,
}: {
  detail: Transaction;
  onAssign: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">{detail.referenceNumber}</h2>
          <p className="text-sm text-muted-foreground">{detail.initiatorName}{detail.description ? ` · ${detail.description}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {detail.totalValue != null && (
            <span className="text-lg font-bold text-foreground">${Number(detail.totalValue).toLocaleString()}</span>
          )}
          <StatusBadge status={detail.status} />
        </div>
      </div>

      {/* Action bar */}
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

      {/* O2C Flow */}
      <div className="bg-card border border-card-border rounded-lg p-4 sm:p-5">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-4">
          Order-to-Cash Flow
        </h3>
        <O2CFlowStepper documents={detail.documents ?? []} />
      </div>
    </div>
  );
}

// ─── Create Transaction Dialog ────────────────────────────────────────────────

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
            <Label htmlFor="refNum">Reference / PO Number <span className="text-destructive">*</span></Label>
            <Input
              id="refNum"
              placeholder="e.g. PO-2024-001"
              value={form.referenceNumber}
              onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
              required
            />
            <p className="text-[11px] text-muted-foreground">Documents with this PO number will auto-link to this transaction.</p>
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

// ─── Assign Documents Dialog ──────────────────────────────────────────────────

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
  const { data: allDocs = [] } = useListEdiDocuments(undefined, {
    query: { queryKey: getListEdiDocumentsQueryKey(), enabled: open },
  });
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
              No unassigned documents found. All documents are already linked to a transaction.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto pr-1" style={{ scrollbarGutter: "stable" }}>
              <div className="space-y-1">
                {unlinked.map(doc => (
                  <label
                    key={doc.id}
                    className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 p-2.5 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(doc.id)}
                      onCheckedChange={() => toggle(doc.id)}
                    />
                    <DocTypeBadge type={doc.documentType} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.senderName} → {doc.receiverName}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.referenceNumber ?? doc.id.slice(-8)}</p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button
            disabled={selected.size === 0 || isPending}
            onClick={() => assign(Array.from(selected))}
          >
            {isPending ? "Assigning…" : `Assign${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Transactions Page ───────────────────────────────────────────────────

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
      {/* Left: transaction list */}
      <div className="flex flex-col w-full lg:w-80 xl:w-96 border-r border-border shrink-0 overflow-y-auto">
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
              <p className="mt-2 text-xs">Or create an inbound EDI 850 document — a transaction will be created automatically.</p>
            </div>
          )}
          {transactions?.map(tx => {
            // Count completed steps for progress mini-bar
            return (
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
                    <p className="text-xs text-muted-foreground truncate">{tx.initiatorName}</p>
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
            );
          })}
        </div>
      </div>

      {/* Right: detail panel (desktop) */}
      <div className="flex-1 hidden lg:block overflow-y-auto">
        {detail ? (
          <TransactionDetail
            detail={detail}
            onAssign={() => setShowAssign(true)}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <ArrowLeftRight className="w-10 h-10 opacity-20" />
            <p className="text-sm">Select a transaction to view its Order-to-Cash flow</p>
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
