import DocTypeBadge, { docTypeLabel } from "@/components/DocTypeBadge";
import StatusBadge from "@/components/StatusBadge";

interface LineItem {
  description: string;
  quantity: number;
  uom?: string;
  unitPrice: number;
}

export interface EdiDocumentData {
  documentType: string;
  controlNumber?: string | null;
  referenceNumber?: string | null;
  poNumber?: string | null;
  invoiceNumber?: string | null;
  invoiceDueDate?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
  shipDate?: string | null;
  deliveryDate?: string | null;
  paymentTerms?: string | null;
  currencyCode?: string | null;
  carrierName?: string | null;
  proNumber?: string | null;
  trackingNumber?: string | null;
  packageCount?: number | null;
  weight?: number | null;
  weightUOM?: string | null;
  equipmentType?: string | null;
  specialInstructions?: string | null;
  ackStatus?: string | null;
  loadResponseCode?: string | null;
  lineItems?: string | null;
  totalAmount?: number | null;
  notes?: string | null;
  createdAt: string;
  status: string;
  direction?: string | null;
}

export function EdiDocumentCard({ doc }: { doc: EdiDocumentData }) {
  const lineItems: LineItem[] = (() => {
    try { return doc.lineItems ? JSON.parse(doc.lineItems) : []; }
    catch { return []; }
  })();

  const currency = doc.currencyCode || "PHP";

  const detailFields = [
    { label: "PO Number", value: doc.poNumber },
    { label: "Invoice Number", value: doc.invoiceNumber },
    { label: "Reference #", value: doc.referenceNumber },
    { label: "Ship Date", value: doc.shipDate },
    { label: "Delivery Date", value: doc.deliveryDate },
    { label: "Invoice Due Date", value: doc.invoiceDueDate },
    { label: "Payment Terms", value: doc.paymentTerms },
    { label: "Currency", value: doc.currencyCode },
    { label: "Carrier", value: doc.carrierName },
    { label: "PRO Number", value: doc.proNumber },
    { label: "Tracking #", value: doc.trackingNumber },
    { label: "Packages", value: doc.packageCount != null ? String(doc.packageCount) : null },
    { label: "Weight", value: doc.weight != null ? `${doc.weight} ${doc.weightUOM ?? ""}`.trim() : null },
    { label: "Equipment Type", value: doc.equipmentType },
    { label: "Ack Status", value: doc.ackStatus },
    { label: "Load Response", value: doc.loadResponseCode },
  ].filter(f => f.value);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card text-sm">
      {/* Document Header */}
      <div className="bg-muted/30 border-b border-border px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <DocTypeBadge type={doc.documentType} />
            <StatusBadge status={doc.status} />
            {doc.direction && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                doc.direction === "outbound"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                  : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
              }`}>
                {doc.direction}
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-foreground">{docTypeLabel(doc.documentType)}</h2>
        </div>
        <div className="text-right shrink-0">
          {doc.controlNumber && (
            <p className="text-xs text-muted-foreground">
              Control # <span className="font-mono font-semibold text-foreground">{doc.controlNumber}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{new Date(doc.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {/* From / To — hidden on inbound (direction is always known) */}
      {doc.direction !== "inbounds" && (
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <div className="px-5 py-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1.5">Sender (From)</p>
            <p className="font-semibold text-foreground">{doc.senderName ?? "—"}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1.5">Receiver (To)</p>
            <p className="font-semibold text-foreground">{doc.receiverName ?? "—"}</p>
          </div>
        </div>
      )}

      {/* Transaction Detail Fields */}
      {detailFields.length > 0 && (
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-3">Transaction Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {detailFields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes / Special Instructions */}
      {(doc.notes || doc.specialInstructions) && (
        <div className="px-5 py-3 border-b border-border bg-amber-50/40 dark:bg-amber-900/10">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">
            {doc.specialInstructions ? "Special Instructions" : "Notes"}
          </p>
          <p className="text-sm text-foreground">{doc.specialInstructions ?? doc.notes}</p>
        </div>
      )}

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-3">Line Items</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left pb-2 pr-4 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide w-8">#</th>
                  <th className="text-left pb-2 pr-4 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Description</th>
                  <th className="text-right pb-2 pr-4 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Qty</th>
                  <th className="text-right pb-2 pr-4 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">UOM</th>
                  <th className="text-right pb-2 pr-4 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Unit Price</th>
                  <th className="text-right pb-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="py-2.5 pr-4 text-foreground font-medium">{item.description}</td>
                    <td className="py-2.5 pr-4 text-right text-foreground">{item.quantity}</td>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground">{item.uom ?? "EA"}</td>
                    <td className="py-2.5 pr-4 text-right text-foreground">{currency} {item.unitPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-semibold text-foreground">{currency} {(item.quantity * item.unitPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Total */}
      {doc.totalAmount != null && (
        <div className="px-5 py-4 flex justify-end bg-muted/20 border-t border-border">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Total Amount</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {currency} {doc.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
