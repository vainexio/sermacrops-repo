import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useListCompanies } from "@workspace/api-client-react";
import { apiBase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Package, Leaf, ShoppingCart, FileCheck,
  CheckCircle2, Clock, Circle, ArrowRight, Loader2, AlertTriangle,
  ChevronsRight, MinusCircle, Send, Boxes,
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

interface ProcurementOrder {
  id: string;
  referenceNumber: string;
  status: "open" | "acknowledged" | "received" | "completed";
  supplierId: string;
  supplierName?: string | null;
  currentStep: number;
  skippedSteps: number[];
  lineItems: ProcLineItem[];
  totalValue?: number | null;
  notes?: string | null;
  ediDoc?: { id: string; documentType: string; status: string; controlNumber: string } | null;
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

// ─── Procurement Step Indicator ───────────────────────────────────────────────

const PROC_STEPS = [
  { step: 1, label: "PO Sent to Supplier", direction: "outbound", Icon: ShoppingCart },
  { step: 2, label: "Supplier Acknowledged", direction: "inbound", Icon: FileCheck },
  { step: 3, label: "Goods Received", direction: "inbound", Icon: Package },
] as const;

type ProcStep = typeof PROC_STEPS[number];

type ProcStepStatus = "completed" | "next" | "pending" | "skipped";

function getProcStepStatus(step: ProcStep, order: ProcurementOrder, index: number): ProcStepStatus {
  const skipped = new Set(order.skippedSteps ?? []);
  if (skipped.has(step.step)) return "skipped";
  if (order.status === "completed" || step.step < order.currentStep) return "completed";
  if (step.step === order.currentStep) return "next";
  return "pending";
}

function ProcStepCircle({ status }: { status: ProcStepStatus }) {
  if (status === "completed") return (
    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
      <CheckCircle2 className="w-4 h-4 text-white" />
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
  onSkip,
  isAdvancing,
  isSkipping,
}: {
  order: ProcurementOrder;
  onAdvance: (step: number) => void;
  onSkip: (step: number) => void;
  isAdvancing: boolean;
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
        const canSkip = isNext && order.status !== "completed";
        const isOutbound = step.direction === "outbound";

        return (
          <div key={step.step} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <ProcStepCircle status={status} />
              {!isLast && (
                <div className={`w-0.5 flex-1 my-1 min-h-[1.5rem] rounded-full ${status === "completed" ? "bg-emerald-300" : "bg-border"}`} />
              )}
            </div>
            <div className="flex-1 pb-3">
              <div className={`rounded-lg border p-2.5 transition-colors text-xs ${
                isSkipped ? "border-border/30 bg-muted/10 opacity-60" :
                status === "completed" ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900" :
                isNext && isOutbound ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200" :
                isNext ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" :
                "border-border/40 bg-muted/10"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3 h-3 shrink-0 ${
                      isSkipped ? "text-muted-foreground/30" :
                      status === "completed" ? "text-emerald-600" :
                      isNext && isOutbound ? "text-blue-600" :
                      isNext ? "text-amber-600" :
                      "text-muted-foreground/50"
                    }`} />
                    <span className={`font-semibold ${
                      isSkipped ? "line-through text-muted-foreground/40" :
                      status === "completed" ? "text-foreground" :
                      isNext && isOutbound ? "text-blue-700 dark:text-blue-300" :
                      isNext ? "text-amber-700 dark:text-amber-300" :
                      "text-muted-foreground/60"
                    }`}>
                      Step {step.step} · {step.label}
                    </span>
                  </div>

                  {isNext && !isSkipped && step.step !== 2 && (
                    <Button
                      size="sm"
                      className={`h-6 text-[10px] px-2 gap-1 shrink-0 ${
                        isOutbound
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                      onClick={() => onAdvance(step.step)}
                      disabled={isAdvancing}
                    >
                      {isAdvancing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                      {step.step === 1 ? "Send PO" : "Confirm Receipt"}
                    </Button>
                  )}
                  {isNext && !isSkipped && step.step === 2 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 italic shrink-0">
                      <Clock className="w-2.5 h-2.5" /> Awaiting inbound 855
                    </span>
                  )}
                </div>

                {isNext && canSkip && (
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
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [reorderPoint, setReorderPoint] = useState(String(item?.reorderPoint ?? ""));
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
              <Label>SKU <span className="text-destructive">*</span></Label>
              <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SKU-001" required />
            </div>
            <div className="space-y-1.5">
              <Label>Unit <span className="text-destructive">*</span></Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">pcs</SelectItem>
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
              <Label>Reorder Point</Label>
              <Input type="number" min="0" step="0.01" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)} placeholder="Optional" />
            </div>
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
      return [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unit: item.unit, unitPrice: 0 }];
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
    onSuccess: (data: { sendResult: { message: string } }) => {
      toast({ title: "Step advanced", description: data.sendResult?.message });
      queryClient.invalidateQueries({ queryKey: ["procurement"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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
    open: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    acknowledged: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    received: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
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
          onSkip={step => skipStep(step)}
          isAdvancing={isAdvancing}
          isSkipping={isSkipping}
        />
      </div>

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
