import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListTransactions, getListTransactionsQueryKey,
  useGetTransaction, getGetTransactionQueryKey,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useListCompanies,
  type Transaction,
  type EdiDocument,
  type Company,
} from "@workspace/api-client-react";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ArrowLeftRight, ChevronDown, ChevronUp, Plus,
  CheckCircle2, XCircle, Clock, Circle, ArrowRight, Send,
  ShoppingCart, FileCheck, Truck, CheckSquare, Package, Receipt, Trash2,
  Hourglass,
} from "lucide-react";

// ─── Order-to-Cash step definitions ──────────────────────────────────────────

const O2C_STEPS = [
  {
    step: 1, ediType: "850", direction: "inbound" as const,
    label: "Purchase Order", from: "Customer", to: "SERMACROPS",
    description: "Customer sends purchase order",
    Icon: ShoppingCart,
  },
  {
    step: 2, ediType: "855", direction: "outbound" as const,
    label: "PO Acknowledgment", from: "SERMACROPS", to: "Customer",
    description: "Acknowledge the purchase order",
    Icon: FileCheck,
  },
  {
    step: 3, ediType: "204", direction: "outbound" as const,
    label: "Load Tender", from: "SERMACROPS", to: "Logistics",
    description: "Arrange transportation with logistics partner",
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
    label: "Ship Notice (ASN)", from: "SERMACROPS", to: "Customer",
    description: "Forward shipment notification to customer",
    Icon: Package,
  },
  {
    step: 8, ediType: "810", direction: "outbound" as const,
    label: "Invoice", from: "SERMACROPS", to: "Customer",
    description: "Send invoice for payment",
    Icon: Receipt,
  },
] as const;

type O2CStep = typeof O2C_STEPS[number];
type EdiDoc = EdiDocument & {
  currencyCode?: string | null;
  ackStatus?: string | null;
  invoiceNumber?: string | null;
  invoiceDueDate?: string | null;
  carrierName?: string | null;
  proNumber?: string | null;
  trackingNumber?: string | null;
  packageCount?: number | null;
  weight?: number | null;
  weightUOM?: string | null;
  equipmentType?: string | null;
  specialInstructions?: string | null;
};

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
  return (
    <div className="w-8 h-8 rounded-full border-2 border-border bg-muted flex items-center justify-center shrink-0">
      <Circle className="w-3 h-3 text-muted-foreground/40" />
    </div>
  );
}

// ─── O2C Flow Stepper ─────────────────────────────────────────────────────────

function O2CFlowStepper({
  documents,
  onAdvance,
}: {
  documents: EdiDoc[];
  onAdvance: (step: O2CStep) => void;
}) {
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
          const isNext = status === "next";
          const isInboundNext = isNext && step.direction === "inbound";
          const isOutboundNext = isNext && step.direction === "outbound";

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
                  isOutboundNext ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200" :
                  isInboundNext ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20" :
                  "border-border/50 bg-muted/20"
                }`}>
                  {/* Step header */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${
                        status === "completed" ? "text-emerald-600" :
                        status === "failed" ? "text-red-500" :
                        status === "in_progress" ? "text-blue-500" :
                        isOutboundNext ? "text-blue-600" :
                        isInboundNext ? "text-amber-600" :
                        "text-muted-foreground"
                      }`} />
                      <span className={`text-xs font-semibold ${
                        status === "pending" ? "text-muted-foreground" :
                        isOutboundNext ? "text-blue-700 dark:text-blue-300" :
                        isInboundNext ? "text-amber-700 dark:text-amber-300" :
                        "text-foreground"
                      }`}>
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
                  ) : isOutboundNext ? (
                    <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
                      <p className="text-[11px] text-blue-600 dark:text-blue-400">{step.description}</p>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        onClick={() => onAdvance(step)}
                      >
                        <Send className="w-3 h-3" /> Send
                      </Button>
                    </div>
                  ) : isInboundNext ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Hourglass className="w-3 h-3 text-amber-500 animate-pulse shrink-0" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Awaiting from partner</p>
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

// ─── Advance Step Dialog ──────────────────────────────────────────────────────

function AdvanceStepDialog({
  transactionId,
  step,
  step1Doc,
  companies,
  onClose,
  onSuccess,
}: {
  transactionId: string;
  step: O2CStep;
  step1Doc: EdiDoc | null;
  companies: Company[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  const lineItemCount = (() => {
    try { return step1Doc?.lineItems ? (JSON.parse(step1Doc.lineItems) as unknown[]).length : 0; }
    catch { return 0; }
  })();

  // Step-specific state
  const [ackStatus, setAckStatus] = useState("AC");
  const [logisticsCompanyId, setLogisticsCompanyId] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [supplierCompanyId, setSupplierCompanyId] = useState("");
  const [supplierPoNumber, setSupplierPoNumber] = useState("");
  const [shipDate, setShipDate] = useState((step1Doc as EdiDoc | null)?.shipDate ?? "");
  const [carrierName, setCarrierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packageCount, setPackageCount] = useState("");
  const [weight, setWeight] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString().slice(-8)}`);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState((step1Doc as EdiDoc | null)?.paymentTerms ?? "");

  const partnerCompanies = companies.filter(c => !(/sermacrops/i.test(c.name ?? "")));

  const { mutate, isPending } = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/transactions/${transactionId}/advance-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to advance step");
      }
      return res.json() as Promise<{ success: boolean; sendResult: { success: boolean; message: string } }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.sendResult.success
          ? `Step ${step.step} · ${step.label} sent`
          : `Step ${step.step} · ${step.label} created`,
        description: data.sendResult.message,
      });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { step: step.step };
    if (step.step === 2) {
      body.ackStatus = ackStatus;
    }
    if (step.step === 3) {
      body.logisticsCompanyId = logisticsCompanyId;
      if (equipmentType) body.equipmentType = equipmentType;
      if (specialInstructions) body.specialInstructions = specialInstructions;
    }
    if (step.step === 5) {
      body.supplierCompanyId = supplierCompanyId;
      if (supplierPoNumber) body.supplierPoNumber = supplierPoNumber;
    }
    if (step.step === 7) {
      if (shipDate) body.shipDate = shipDate;
      if (carrierName) body.carrierName = carrierName;
      if (trackingNumber) body.trackingNumber = trackingNumber;
      if (packageCount) body.packageCount = Number(packageCount);
      if (weight) body.weight = Number(weight);
    }
    if (step.step === 8) {
      body.invoiceNumber = invoiceNumber;
      if (invoiceDueDate) body.invoiceDueDate = invoiceDueDate;
      if (paymentTerms) body.paymentTerms = paymentTerms;
    }
    mutate(body);
  }

  const isValid = () => {
    if (step.step === 3 && !logisticsCompanyId) return false;
    if (step.step === 5 && !supplierCompanyId) return false;
    return true;
  };

  const { Icon } = step;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="w-4 h-4 text-blue-600" />
            Step {step.step} · {step.label}
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5">{step.from} → {step.to}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Inherited from Step 1 */}
          {step1Doc && (
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                Inherited from Purchase Order
              </p>
              {(step1Doc.poNumber ?? step1Doc.referenceNumber) && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">PO Number</span>
                  <span className="font-mono font-semibold">{step1Doc.poNumber ?? step1Doc.referenceNumber}</span>
                </div>
              )}
              {step1Doc.totalAmount != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold">
                    {(step1Doc as EdiDoc).currencyCode ?? "PHP"} {Number(step1Doc.totalAmount).toLocaleString()}
                  </span>
                </div>
              )}
              {lineItemCount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Line Items</span>
                  <span className="font-semibold">{lineItemCount} item{lineItemCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              {step1Doc.shipDate && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Ship Date</span>
                  <span className="font-semibold">{step1Doc.shipDate}</span>
                </div>
              )}
              {step1Doc.deliveryDate && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Delivery Date</span>
                  <span className="font-semibold">{step1Doc.deliveryDate}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: PO Acknowledgment */}
          {step.step === 2 && (
            <div className="space-y-1.5">
              <Label>Response <span className="text-destructive">*</span></Label>
              <Select value={ackStatus} onValueChange={setAckStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AC">✅ Accept</SelectItem>
                  <SelectItem value="RJ">❌ Reject</SelectItem>
                  <SelectItem value="CA">✏️ Accept with Changes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Dates, items, and PO number are automatically carried over.
              </p>
            </div>
          )}

          {/* Step 3: Load Tender */}
          {step.step === 3 && (
            <>
              <div className="space-y-1.5">
                <Label>Logistics Company <span className="text-destructive">*</span></Label>
                <Select value={logisticsCompanyId} onValueChange={setLogisticsCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select logistics partner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Equipment Type</Label>
                <Input
                  placeholder="e.g. DRY VAN, REEFER, FLATBED"
                  value={equipmentType}
                  onChange={e => setEquipmentType(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Special Instructions</Label>
                <Input
                  placeholder="Optional handling notes"
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Step 5: PO to Supplier */}
          {step.step === 5 && (
            <>
              <div className="space-y-1.5">
                <Label>Supplier <span className="text-destructive">*</span></Label>
                <Select value={supplierCompanyId} onValueChange={setSupplierCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>PO Number for Supplier</Label>
                <Input
                  placeholder={step1Doc ? `SUP-${step1Doc.poNumber ?? step1Doc.referenceNumber ?? ""}` : "Auto-generated"}
                  value={supplierPoNumber}
                  onChange={e => setSupplierPoNumber(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to auto-prefix with SUP- from the customer PO.
                </p>
              </div>
            </>
          )}

          {/* Step 7: Ship Notice */}
          {step.step === 7 && (
            <>
              <div className="space-y-1.5">
                <Label>Ship Date</Label>
                <Input
                  type="date"
                  value={shipDate}
                  onChange={e => setShipDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Carrier</Label>
                  <Input
                    placeholder="Carrier name"
                    value={carrierName}
                    onChange={e => setCarrierName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tracking #</Label>
                  <Input
                    placeholder="Tracking number"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Package Count</Label>
                  <Input
                    type="number" min="1" placeholder="0"
                    value={packageCount}
                    onChange={e => setPackageCount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight (KG)</Label>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 8: Invoice */}
          {step.step === 8 && (
            <>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={invoiceDueDate}
                    onChange={e => setInvoiceDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Terms</Label>
                  <Input
                    placeholder="e.g. Net 30"
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !isValid()} className="gap-1.5">
              <Send className="w-3.5 h-3.5" />
              {isPending ? "Sending…" : "Send Document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction Detail Panel ─────────────────────────────────────────────────

function TransactionDetail({
  detail,
  onStatusChange,
  onDelete,
}: {
  detail: Transaction;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeStep, setActiveStep] = useState<O2CStep | null>(null);

  const { data: companies = [] } = useListCompanies();
  const documents = (detail.documents ?? []) as EdiDoc[];
  const step1Doc = documents.find(d => d.documentType === "850" && d.direction === "inbound") ?? null;

  function handleAdvanceSuccess() {
    queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(detail.id) });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  }

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
        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-muted-foreground">Delete this transaction?</span>
              <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={onDelete}>Confirm</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* O2C Flow */}
      <div className="bg-card border border-card-border rounded-lg p-4 sm:p-5">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-4">
          Order-to-Cash Flow
        </h3>
        <O2CFlowStepper
          documents={documents}
          onAdvance={setActiveStep}
        />
      </div>

      {/* Advance Step Dialog */}
      {activeStep && (
        <AdvanceStepDialog
          transactionId={detail.id}
          step={activeStep}
          step1Doc={step1Doc}
          companies={companies}
          onClose={() => setActiveStep(null)}
          onSuccess={handleAdvanceSuccess}
        />
      )}
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

// ─── Main Transactions Page ───────────────────────────────────────────────────

export default function Transactions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const { mutate: deleteTx } = useDeleteTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(params) });
        setSelectedId(null);
        toast({ title: "Transaction deleted" });
      },
      onError: () => toast({ title: "Failed to delete transaction", variant: "destructive" }),
    },
  });

  function toggle(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  function handleStatusChange(status: string) {
    if (!selectedId) return;
    updateStatus({ id: selectedId, data: { status } });
  }

  function handleDeleteTx() {
    if (!selectedId) return;
    deleteTx({ id: selectedId });
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
            const isSelected = tx.id === selectedId;
            return (
              <div key={tx.id}>
                <button
                  onClick={() => toggle(tx.id)}
                  className={`w-full text-left p-4 hover:bg-muted/40 transition-colors ${isSelected ? "bg-muted/60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">{tx.referenceNumber}</span>
                    <StatusBadge status={tx.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-1.5">{tx.initiatorName}</p>
                  {tx.totalValue != null && (
                    <p className="text-xs font-medium text-foreground mb-1.5">${Number(tx.totalValue).toLocaleString()}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel (desktop) */}
      <div className="hidden lg:flex flex-col flex-1 overflow-y-auto">
        {selectedId && detail ? (
          <TransactionDetail
            detail={detail}
            onStatusChange={handleStatusChange}
            onDelete={handleDeleteTx}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <ArrowLeftRight className="w-8 h-8 mx-auto opacity-20" />
              <p>Select a transaction to view its Order-to-Cash flow</p>
              <p className="text-xs opacity-60">Receive an inbound 850 to automatically start a new transaction</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateTransactionDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
