import { useState, useEffect, useRef } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListCompanies } from "@workspace/api-client-react";
import { apiBase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StatusBadge from "@/components/StatusBadge";
import {
  Plus, Pencil, Trash2, Package, Leaf, ShoppingCart, FileCheck,
  CheckCircle2, Clock, Circle, ArrowRight, Loader2, AlertTriangle,
  ChevronsRight, MinusCircle, Send, Boxes, FileText, Eye, X, CheckSquare, ExternalLink,
  Warehouse, AlertCircle, TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  category: "manufactured" | "raw_material";
  sku: string;
  quantity: number;
  unit: string;
  reorderPoint?: number | null;
  unitPrice?: number | null;
  supplierId?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProcLineItem {
  inventoryItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

interface StepDoc {
  id: string;
  documentType: string;
  status: string;
  controlNumber: string;
}

interface ProcurementOrder {
  id: string;
  referenceNumber: string;
  status: "open" | "acknowledged" | "received" | "billing" | "completed";
  supplierId: string;
  supplierName?: string | null;
  currentStep: number;
  skippedSteps: number[];
  lineItems: ProcLineItem[];
  totalValue?: number | null;
  notes?: string | null;
  ediDoc?: StepDoc | null;
  stepDocs?: Record<string, StepDoc>;
  createdAt: string;
  updatedAt: string;
}

// ─── API hooks ────────────────────────────────────────────────────────────────

function useInventory() {
  return useQuery<InventoryItem[]>({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/inventory`);
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
  });
}

function useProcurement() {
  return useQuery<ProcurementOrder[]>({
    queryKey: ["procurement"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/procurement`);
      if (!res.ok) throw new Error("Failed to fetch procurement orders");
      return res.json();
    },
  });
}

// ─── Low Stock Badge ──────────────────────────────────────────────────────────

function LowStockBadge({ quantity, reorderPoint }: { quantity: number; reorderPoint?: number | null }) {
  if (!reorderPoint || quantity > reorderPoint) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">
      <AlertTriangle className="w-2.5 h-2.5" /> Low Stock
    </span>
  );
}

// ─── EDI Document Viewer Dialog ───────────────────────────────────────────────

function EdiDocumentViewerDialog({ docId, stepDoc, onClose }: { docId: string; stepDoc?: StepDoc | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ content: string; documentType: string }>({
    queryKey: ["edi-doc-preview", docId],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/edi-documents/${docId}/preview`);
      if (!res.ok) throw new Error("Failed to load document");
      return res.json();
    },
  });

  const docType = stepDoc?.documentType ?? data?.documentType;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-blue-600" />
              EDI {docType ?? "Document"}
              {stepDoc?.controlNumber && (
                <span className="text-xs font-normal text-muted-foreground font-mono">#{stepDoc.controlNumber}</span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {stepDoc?.status && <StatusBadge status={stepDoc.status} className="text-[10px] py-0" />}
              <Link
                href={`/documents/${docId}`}
                onClick={onClose}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
              >
                <ExternalLink className="w-3 h-3" />
                Open in Documents
              </Link>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : data?.content ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded-lg p-4 border border-border leading-relaxed text-foreground">
              {data.content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">No X12 content available.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Procurement Step Indicator ───────────────────────────────────────────────

const PROC_STEPS = [
  { step: 1, label: "PO Sent to Supplier",           direction: "outbound", Icon: ShoppingCart, docType: "850", passive: false, waitLabel: null,               sendLabel: "Send PO" },
  { step: 2, label: "Supplier Acknowledged",          direction: "inbound",  Icon: FileCheck,   docType: "855", passive: true,  waitLabel: "Awaiting inbound 855", sendLabel: null },
  { step: 3, label: "ASN from Supplier",              direction: "inbound",  Icon: Package,     docType: "856", passive: true,  waitLabel: "Awaiting inbound 856", sendLabel: null },
  { step: 4, label: "Invoice from Supplier",          direction: "inbound",  Icon: FileText,    docType: "810", passive: true,  waitLabel: "Awaiting inbound 810", sendLabel: null },
  { step: 5, label: "Receiving Advice to Supplier",   direction: "outbound", Icon: CheckSquare, docType: "861", passive: false, waitLabel: null,               sendLabel: "Send 861" },
] as const;

type ProcStep = typeof PROC_STEPS[number];

type ProcStepStatus = "completed" | "failed" | "next" | "pending" | "skipped";

const PROC_STEP_SUCCESS = ["delivered", "sent", "accepted"];
const PROC_STEP_FAIL    = ["failed", "retry_pending"];

function getProcStepStatus(step: ProcStep, order: ProcurementOrder, _index: number): ProcStepStatus {
  const skipped = new Set(order.skippedSteps ?? []);
  if (skipped.has(step.step)) return "skipped";
  if (order.status === "completed") return "completed";

  const stepDoc = order.stepDocs?.[step.docType];

  // Failed / retry-pending doc — step needs attention
  if (stepDoc && PROC_STEP_FAIL.includes(stepDoc.status)) return "failed";

  // If any prior non-skipped step is failed, block this step
  const hasPriorFailed = PROC_STEPS.some(s =>
    s.step < step.step &&
    !skipped.has(s.step) &&
    order.stepDocs?.[s.docType] != null &&
    PROC_STEP_FAIL.includes(order.stepDocs[s.docType].status)
  );
  if (hasPriorFailed) return "pending";

  // Compute the effective current step from doc statuses so that a successfully
  // delivered doc always marks the step complete even if the backend failed to
  // increment currentStep (e.g. race condition or retry edge-case).
  let docBasedStep = 1;
  for (const s of PROC_STEPS) {
    if (!skipped.has(s.step)) {
      const doc = order.stepDocs?.[s.docType];
      if (doc && PROC_STEP_SUCCESS.includes(doc.status)) {
        docBasedStep = Math.max(docBasedStep, s.step + 1);
      }
    }
  }
  const effectiveStep = Math.max(order.currentStep, docBasedStep);

  if (step.step < effectiveStep) return "completed";
  if (step.step === effectiveStep) return "next";
  return "pending";
}

function ProcStepCircle({ status }: { status: ProcStepStatus }) {
  if (status === "completed") return (
    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
      <CheckCircle2 className="w-4 h-4 text-white" />
    </div>
  );
  if (status === "failed") return (
    <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0 shadow-sm">
      <X className="w-4 h-4 text-white" />
    </div>
  );
  if (status === "next") return (
    <div className="w-7 h-7 rounded-full border-2 border-blue-400 bg-blue-50 flex items-center justify-center shrink-0 animate-pulse">
      <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
    </div>
  );
  if (status === "skipped") return (
    <div className="w-7 h-7 rounded-full border-2 border-muted-foreground/20 bg-muted/30 flex items-center justify-center shrink-0">
      <MinusCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-full border-2 border-border bg-muted flex items-center justify-center shrink-0">
      <Circle className="w-2.5 h-2.5 text-muted-foreground/40" />
    </div>
  );
}

// ─── Procurement Stepper ──────────────────────────────────────────────────────

function ProcurementStepper({
  order,
  onAdvance,
  onRetry,
  onSkip,
  onViewDoc,
  isAdvancing,
  isRetrying,
  isSkipping,
}: {
  order: ProcurementOrder;
  onAdvance: (step: number) => void;
  onRetry: (docId: string) => void;
  onSkip: (step: number) => void;
  onViewDoc: (docId: string, stepDoc: StepDoc) => void;
  isAdvancing: boolean;
  isRetrying: boolean;
  isSkipping: boolean;
}) {
  const skipped = new Set(order.skippedSteps ?? []);

  return (
    <div className="space-y-0">
      {PROC_STEPS.map((step, index) => {
        const status = getProcStepStatus(step, order, index);
        const isLast = index === PROC_STEPS.length - 1;
        const { Icon } = step;
        const isNext = status === "next";
        const isSkipped = status === "skipped";
        const isCompleted = status === "completed";
        const isFailed = status === "failed";
        const canSkip = (isNext || isFailed) && order.status !== "completed";
        const isOutbound = step.direction === "outbound";
        const stepDoc = order.stepDocs?.[step.docType];

        return (
          <div key={step.step} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <ProcStepCircle status={status} />
              {!isLast && (
                <div className={`w-0.5 flex-1 my-1 min-h-[1.5rem] rounded-full ${
                  isCompleted ? "bg-emerald-300" :
                  isFailed ? "bg-red-300" :
                  "bg-border"
                }`} />
              )}
            </div>
            <div className="flex-1 pb-3">
              <div className={`rounded-lg border p-2.5 transition-colors text-xs ${
                isSkipped ? "border-border/30 bg-muted/10 opacity-60" :
                isFailed ? "border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900" :
                isCompleted ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900" :
                isNext && isOutbound ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200" :
                isNext ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" :
                "border-border/40 bg-muted/10"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3 h-3 shrink-0 ${
                      isSkipped ? "text-muted-foreground/30" :
                      isFailed ? "text-red-500" :
                      isCompleted ? "text-emerald-600" :
                      isNext && isOutbound ? "text-blue-600" :
                      isNext ? "text-amber-600" :
                      "text-muted-foreground/50"
                    }`} />
                    <span className={`font-semibold ${
                      isSkipped ? "line-through text-muted-foreground/40" :
                      isFailed ? "text-red-700 dark:text-red-400" :
                      isCompleted ? "text-foreground" :
                      isNext && isOutbound ? "text-blue-700 dark:text-blue-300" :
                      isNext ? "text-amber-700 dark:text-amber-300" :
                      "text-muted-foreground/60"
                    }`}>
                      {step.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {(isCompleted || isFailed) && stepDoc && (
                      <>
                        <StatusBadge status={stepDoc.status} className="text-[10px] py-0 px-1.5" />
                        <button
                          onClick={() => onViewDoc(stepDoc.id, stepDoc)}
                          className={`flex items-center gap-1 text-[10px] hover:underline font-medium transition-colors ${
                            isFailed ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          View
                        </button>
                        <Link
                          href={`/documents/${stepDoc.id}`}
                          className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Open
                        </Link>
                      </>
                    )}
                    {isFailed && isOutbound && stepDoc && (
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2 gap-1 bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => onRetry(stepDoc.id)}
                        disabled={isRetrying}
                      >
                        {isRetrying ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                        Retry
                      </Button>
                    )}
                    {isNext && !isSkipped && !step.passive && step.sendLabel && (
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => onAdvance(step.step)}
                        disabled={isAdvancing}
                      >
                        {isAdvancing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                        {step.sendLabel}
                      </Button>
                    )}
                    {isNext && !isSkipped && step.passive && step.waitLabel && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 italic">
                        <Clock className="w-2.5 h-2.5" /> {step.waitLabel}
                      </span>
                    )}
                  </div>
                </div>

                {(isNext || isFailed) && canSkip && (
                  <div className="mt-1.5 pt-1.5 border-t border-border/30">
                    <button
                      onClick={() => onSkip(step.step)}
                      disabled={isSkipping}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSkipping ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ChevronsRight className="w-2.5 h-2.5" />}
                      Skip this step
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Inventory Item Form Dialog ───────────────────────────────────────────────

function InventoryItemDialog({
  item,
  category,
  companies,
  onClose,
  onSaved,
}: {
  item?: InventoryItem;
  category: "manufactured" | "raw_material";
  companies: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!item;

  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? "0"));
  const [unit, setUnit] = useState(item?.unit ?? "ea");
  const [reorderPoint, setReorderPoint] = useState(String(item?.reorderPoint ?? ""));
  const [unitPrice, setUnitPrice] = useState(String(item?.unitPrice ?? ""));

  const { data: inventoryItems } = useInventory();
  const skuInitialized = useRef(false);

  useEffect(() => {
    if (!isEdit && !skuInitialized.current && inventoryItems) {
      skuInitialized.current = true;
      const prefix = category === "manufactured" ? "SKU-MFG" : "SKU-RAW";
      const catItems = inventoryItems.filter(i => i.sku.startsWith(prefix + "-"));
      const nextNum = catItems.length + 1;
      setSku(`${prefix}-${String(nextNum).padStart(4, "0")}`);
    }
  }, [inventoryItems]);

  useEffect(() => {
    if (!isEdit) {
      const qty = Number(quantity);
      if (!isNaN(qty) && qty > 0) {
        setReorderPoint(String(Math.floor(qty * 0.3)));
      }
    }
  }, [quantity]);
  const [supplierId, setSupplierId] = useState(item?.supplierId ?? "none");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const body = {
        name, category,
        sku,
        quantity: Number(quantity),
        unit,
        reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
        unitPrice: unitPrice ? Number(unitPrice) : undefined,
        supplierId: supplierId && supplierId !== "none" ? supplierId : undefined,
        notes: notes || undefined,
      };
      const url = isEdit ? `${apiBase}/api/inventory/${item.id}` : `${apiBase}/api/inventory`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Item updated" : "Item added" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const supplierCompanies = companies.filter(c => c.type === "supplier");

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {category === "manufactured" ? <Package className="w-4 h-4 text-blue-600" /> : <Leaf className="w-4 h-4 text-emerald-600" />}
            {isEdit ? "Edit" : "Add"} {category === "manufactured" ? "Manufactured Product" : "Raw Material"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutate(); }} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Robusta Blend" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                SKU <span className="text-destructive">*</span>
                {!isEdit && <span className="text-[10px] text-muted-foreground font-normal">(auto)</span>}
              </Label>
              <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. MFG-0001" required />
            </div>
            <div className="space-y-1.5">
              <Label>Unit <span className="text-destructive">*</span></Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ea">ea</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                  <SelectItem value="mL">mL</SelectItem>
                  <SelectItem value="bags">bags</SelectItem>
                  <SelectItem value="boxes">boxes</SelectItem>
                  <SelectItem value="rolls">rolls</SelectItem>
                  <SelectItem value="cups">cups</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Current Quantity</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Reorder Point
                {!isEdit && <span className="text-[10px] text-muted-foreground font-normal">(30% of qty)</span>}
              </Label>
              <Input type="number" min="0" step="1" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unit Price (PHP)</Label>
            <Input type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="e.g. 25.00" />
          </div>
          {category === "raw_material" && (
            <div className="space-y-1.5">
              <Label>Default Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {supplierCompanies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !name || !sku || !unit}>
              {isPending ? "Saving…" : isEdit ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteItemDialog({ item, onClose, onDeleted }: { item: InventoryItem; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/inventory/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Item removed" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      onDeleted();
      onClose();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete "{item.name}"?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-1">This will permanently remove the stock item. This cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutate()} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock Table ──────────────────────────────────────────────────────────────

function StockTable({
  items,
  onEdit,
  onDelete,
}: {
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
        <Boxes className="w-8 h-8 opacity-30" />
        <p className="text-sm">No items yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Status</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Supplier</th>
            <th className="py-2 px-3 w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-muted/20 transition-colors">
              <td className="py-2.5 px-3 font-medium text-foreground">{item.name}</td>
              <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
              <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{item.quantity.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-muted-foreground">{item.unit}</td>
              <td className="py-2.5 px-3 hidden sm:table-cell">
                <LowStockBadge quantity={item.quantity} reorderPoint={item.reorderPoint} />
              </td>
              <td className="py-2.5 px-3 text-muted-foreground text-xs hidden md:table-cell">{item.supplierName ?? "—"}</td>
              <td className="py-2.5 px-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(item)}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(item)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Create Purchase Order Dialog ─────────────────────────────────────────────

function CreatePurchaseOrderDialog({
  rawMaterials,
  companies,
  onClose,
  onCreated,
}: {
  rawMaterials: InventoryItem[];
  companies: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const supplierCompanies = companies.filter(c => c.type === "supplier");

  type OrderLine = { inventoryItemId: string; name: string; quantity: number; unit: string; unitPrice: number };
  const [selectedItems, setSelectedItems] = useState<OrderLine[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  function toggleItem(item: InventoryItem) {
    setSelectedItems(prev => {
      const exists = prev.find(l => l.inventoryItemId === item.id);
      if (exists) return prev.filter(l => l.inventoryItemId !== item.id);
      return [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unit: item.unit, unitPrice: item.unitPrice ?? 0 }];
    });
  }

  function updateLine(id: string, field: "quantity" | "unitPrice", val: number) {
    setSelectedItems(prev => prev.map(l => l.inventoryItemId === id ? { ...l, [field]: val } : l));
  }

  const total = selectedItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!supplierId || selectedItems.length === 0) throw new Error("Select a supplier and at least one item");
      const res = await fetch(`${apiBase}/api/procurement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          lineItems: selectedItems,
          totalValue: total > 0 ? total : undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to create purchase order");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Purchase order created", description: "Proceed to Step 1 to send it to the supplier." });
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
      onCreated();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="w-4 h-4 text-blue-600" />
            Create Purchase Order to Supplier
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={e => { e.preventDefault(); mutate(); }} className="space-y-4 py-1">
          {/* Supplier */}
          <div className="space-y-1.5">
            <Label>Supplier <span className="text-destructive">*</span></Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
              <SelectContent>
                {supplierCompanies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Item selection */}
          <div className="space-y-2">
            <Label>Select Raw Materials <span className="text-destructive">*</span></Label>
            {rawMaterials.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No raw materials found. Add some first.</p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border/50 max-h-52 overflow-y-auto">
                {rawMaterials.map(item => {
                  const line = selectedItems.find(l => l.inventoryItemId === item.id);
                  const checked = !!line;
                  return (
                    <div key={item.id} className={`p-2.5 transition-colors ${checked ? "bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-muted/20"}`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(item)}
                          className="w-3.5 h-3.5 accent-blue-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sku} · {item.quantity} {item.unit} in stock</p>
                        </div>
                      </div>
                      {checked && line && (
                        <div className="mt-2 ml-6 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground font-medium">Qty ({item.unit})</p>
                            <Input
                              type="number" min="0.01" step="0.01"
                              value={line.quantity}
                              onChange={e => updateLine(item.id, "quantity", Number(e.target.value))}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground font-medium">Unit Price (PHP)</p>
                            <Input
                              type="number" min="0" step="0.01"
                              value={line.unitPrice}
                              onChange={e => updateLine(item.id, "unitPrice", Number(e.target.value))}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Total */}
          {total > 0 && (
            <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
              <span className="text-muted-foreground">Total</span>
              <span>PHP {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional delivery notes…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !supplierId || selectedItems.length === 0} className="gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5" />
              {isPending ? "Creating…" : "Create Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Procurement Order Card ───────────────────────────────────────────────────

function ProcurementOrderCard({ order }: { order: ProcurementOrder }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showItems, setShowItems] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [viewStepDoc, setViewStepDoc] = useState<StepDoc | null>(null);

  const { mutate: advanceStep, isPending: isAdvancing } = useMutation({
    mutationFn: async (step: number) => {
      const res = await fetch(`${apiBase}/api/procurement/${order.id}/advance-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to advance step");
      }
      return res.json();
    },
    onSuccess: (data: { sendResult: { success: boolean; message: string } }, stepNum: number) => {
      const stepDef = PROC_STEPS.find(s => s.step === stepNum);
      const stepLabel = stepDef?.label ?? "Step";
      toast({
        title: data.sendResult?.success ? `${stepLabel} sent` : `${stepLabel} saved`,
        description: data.sendResult?.message,
        variant: data.sendResult?.success ? "default" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: retryDoc, isPending: isRetrying } = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`${apiBase}/api/edi-documents/${docId}/send`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to resend document");
      }
      return res.json() as Promise<{ success: boolean; message: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Document resent" : "Resend failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: Error) => toast({ title: "Resend error", description: err.message, variant: "destructive" }),
  });

  const { mutate: skipStep, isPending: isSkipping } = useMutation({
    mutationFn: async (step: number) => {
      const updated = [...(order.skippedSteps ?? []), step];
      const res = await fetch(`${apiBase}/api/procurement/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skippedSteps: updated }),
      });
      if (!res.ok) throw new Error("Failed to skip step");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: () => toast({ title: "Failed to skip step", variant: "destructive" }),
  });

  const { mutate: deleteOrder, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/procurement/${order.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Order deleted" });
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const statusColors: Record<string, string> = {
    open:         "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    acknowledged: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    received:     "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
    billing:      "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
    completed:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 flex items-start justify-between gap-2 flex-wrap border-b border-border/50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-foreground">{order.referenceNumber}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[order.status] ?? ""}`}>
              {order.status}
            </span>
            {order.ediDoc && (
              <span className="text-[10px] text-muted-foreground font-mono">850 · {order.ediDoc.status}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Supplier: {order.supplierName ?? "Unknown"}
            {order.totalValue ? ` · PHP ${Number(order.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowItems(v => !v)}
            className="text-[11px] text-blue-500 hover:underline"
          >
            {showItems ? "Hide" : "Items"} ({order.lineItems?.length ?? 0})
          </button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={() => deleteOrder()} disabled={isDeleting}>Confirm</Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Line Items */}
      {showItems && order.lineItems && order.lineItems.length > 0 && (
        <div className="px-3 py-2 bg-muted/20 border-b border-border/50">
          <div className="space-y-1">
            {order.lineItems.map((li, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <span className="text-foreground">{li.name}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{li.quantity} {li.unit}{li.unitPrice ? ` × PHP ${li.unitPrice}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="p-3 sm:p-4">
        <ProcurementStepper
          order={order}
          onAdvance={step => advanceStep(step)}
          onRetry={docId => retryDoc(docId)}
          onSkip={step => skipStep(step)}
          onViewDoc={(docId, sd) => { setViewDocId(docId); setViewStepDoc(sd); }}
          isAdvancing={isAdvancing}
          isRetrying={isRetrying}
          isSkipping={isSkipping}
        />
      </div>

      {viewDocId && (
        <EdiDocumentViewerDialog
          docId={viewDocId}
          stepDoc={viewStepDoc}
          onClose={() => { setViewDocId(null); setViewStepDoc(null); }}
        />
      )}

      {order.notes && (
        <div className="px-3 pb-3 sm:px-4">
          <p className="text-[11px] text-muted-foreground italic">Note: {order.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  iconColor,
  onAdd,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  iconColor: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded flex items-center justify-center ${iconColor}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{count} item{count !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onAdd}>
        <Plus className="w-3.5 h-3.5" /> Add Item
      </Button>
    </div>
  );
}

// ─── Supplier Stock Section ───────────────────────────────────────────────────

type SupplierStockItem = {
  sku: string;
  name: string | null;
  supplierQuantity: number;
  ourQuantity: number | null;
  uom: string;
  matched: boolean;
};

type SupplierStock846 = {
  documentId: string;
  controlNumber: string | null;
  supplierName: string | null;
  receivedAt: string;
  referenceNumber: string | null;
  items: SupplierStockItem[];
};

function SupplierStockSection() {
  const { data, isLoading, isError, refetch } = useQuery<SupplierStock846[]>({
    queryKey: ["supplier-stock"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/supplier-stock`);
      if (!res.ok) throw new Error("Failed to fetch supplier stock");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded flex items-center justify-center bg-blue-500">
          <Warehouse className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm text-foreground">Supplier Stock</h2>
          <p className="text-[11px] text-muted-foreground">
            Live inventory levels from suppliers via EDI 846 – Inventory Advice
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="border border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-6 h-6 opacity-40" />
          <p className="text-sm">Failed to load supplier stock</p>
          <button onClick={() => refetch()} className="text-xs text-blue-500 hover:underline cursor-pointer">Retry</button>
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div className="border border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2 text-muted-foreground">
          <Warehouse className="w-8 h-8 opacity-30" />
          <p className="text-sm">No supplier stock advisories yet</p>
          <p className="text-xs">Suppliers send EDI 846 documents to share their available stock</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.map((doc) => (
            <div key={doc.documentId} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Doc header */}
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {doc.supplierName ?? "Unknown Supplier"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {doc.referenceNumber && <span className="mr-2">{doc.referenceNumber}</span>}
                    {doc.controlNumber && <span className="mr-2">CN: {doc.controlNumber}</span>}
                    Received {new Date(doc.receivedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Link href={`/documents/${doc.documentId}`} className="text-[10px] text-blue-500 hover:underline shrink-0 font-medium">
                  View doc →
                </Link>
              </div>

              {/* Items table */}
              {doc.items.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground italic">No line items found</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {doc.items.map((item) => (
                    <div key={item.sku} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        {item.matched ? (
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        ) : (
                          <p className="text-sm font-medium text-muted-foreground truncate italic">Unknown item</p>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono">{item.sku}</p>
                      </div>

                      {/* Supplier qty */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          {item.supplierQuantity.toLocaleString()}
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">{item.uom}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">supplier stock</p>
                      </div>

                      {/* Our qty */}
                      {item.matched && item.ourQuantity !== null && (
                        <div className="text-right shrink-0 pl-3 border-l border-border/60">
                          <p className={`text-sm font-semibold ${item.ourQuantity === 0 ? "text-destructive" : item.ourQuantity < 10 ? "text-amber-600" : "text-emerald-600"}`}>
                            {item.ourQuantity.toLocaleString()}
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">{item.uom}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
                            {item.ourQuantity < 10 && <TrendingDown className="w-2.5 h-2.5 text-amber-500" />}
                            our stock
                          </p>
                        </div>
                      )}

                      {!item.matched && (
                        <div className="shrink-0 pl-3 border-l border-border/60">
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">
                            <AlertCircle className="w-2.5 h-2.5" /> No match
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const { data: inventory = [], isLoading: loadingInventory } = useInventory();
  const { data: procurementOrders = [], isLoading: loadingProcurement } = useProcurement();
  const { data: companies = [] } = useListCompanies();

  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [addCategory, setAddCategory] = useState<"manufactured" | "raw_material" | null>(null);
  const [showCreatePO, setShowCreatePO] = useState(false);

  const manufactured = inventory.filter(i => i.category === "manufactured");
  const rawMaterials = inventory.filter(i => i.category === "raw_material");
  const activeOrders = procurementOrders.filter(o => o.status !== "completed");
  const completedOrders = procurementOrders.filter(o => o.status === "completed");

  if (loadingInventory && loadingProcurement) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage product stocks and raw material procurement</p>
      </div>

      {/* ── Manufactured Products ── */}
      <section>
        <SectionHeader
          icon={Package}
          title="Manufactured Products"
          count={manufactured.length}
          iconColor="bg-blue-500"
          onAdd={() => setAddCategory("manufactured")}
        />
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {loadingInventory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <StockTable
              items={manufactured}
              onEdit={item => setEditItem(item)}
              onDelete={item => setDeleteItem(item)}
            />
          )}
        </div>
      </section>

      {/* ── Raw Ingredients / Materials ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center bg-emerald-500">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-foreground">Raw Ingredients &amp; Materials</h2>
              <p className="text-[11px] text-muted-foreground">{rawMaterials.length} item{rawMaterials.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
              onClick={() => setShowCreatePO(true)}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Create Purchase Order
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAddCategory("raw_material")}>
              <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {loadingInventory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <StockTable
              items={rawMaterials}
              onEdit={item => setEditItem(item)}
              onDelete={item => setDeleteItem(item)}
            />
          )}
        </div>
      </section>

      {/* ── Supplier Stock ── */}
      <SupplierStockSection />

      {/* ── Procurement Orders ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center bg-violet-500">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-foreground">Procurement Orders</h2>
              <p className="text-[11px] text-muted-foreground">
                {activeOrders.length} active · {completedOrders.length} completed
              </p>
            </div>
          </div>
        </div>

        {loadingProcurement ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : procurementOrders.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <ShoppingCart className="w-8 h-8 opacity-30" />
            <p className="text-sm">No procurement orders yet.</p>
            <p className="text-xs">Use "Create Purchase Order" in the Raw Materials section to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.length > 0 && (
              <div className="space-y-3">
                {activeOrders.map(order => (
                  <ProcurementOrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
            {completedOrders.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1 py-1">
                  <ChevronsRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                  Show {completedOrders.length} completed order{completedOrders.length !== 1 ? "s" : ""}
                </summary>
                <div className="mt-3 space-y-3">
                  {completedOrders.map(order => (
                    <ProcurementOrderCard key={order.id} order={order} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── Dialogs ── */}
      {addCategory && (
        <InventoryItemDialog
          category={addCategory}
          companies={companies}
          onClose={() => setAddCategory(null)}
          onSaved={() => {}}
        />
      )}
      {editItem && (
        <InventoryItemDialog
          item={editItem}
          category={editItem.category}
          companies={companies}
          onClose={() => setEditItem(null)}
          onSaved={() => {}}
        />
      )}
      {deleteItem && (
        <DeleteItemDialog
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={() => {}}
        />
      )}
      {showCreatePO && (
        <CreatePurchaseOrderDialog
          rawMaterials={rawMaterials}
          companies={companies}
          onClose={() => setShowCreatePO(false)}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}
