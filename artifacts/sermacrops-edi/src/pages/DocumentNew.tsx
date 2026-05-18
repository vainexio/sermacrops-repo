import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEdiDocument, useSendEdiDocument, useListCompanies, getListEdiDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Eye } from "lucide-react";
import { Link } from "wouter";

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.coerce.number().min(0.01),
  unitPrice: z.coerce.number().min(0),
  uom: z.string().optional(),
});

const formSchema = z.object({
  documentType: z.string().min(1, "Required"),
  direction: z.string().min(1, "Required"),
  senderId: z.string().min(1, "Required"),
  receiverId: z.string().min(1, "Required"),
  referenceNumber: z.string().optional(),
  poNumber: z.string().optional(),
  shipDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  // 850 / 810
  currencyCode: z.string().optional(),
  // 810
  invoiceNumber: z.string().optional(),
  invoiceDueDate: z.string().optional(),
  // 855
  ackStatus: z.string().optional(),
  // 856
  carrierName: z.string().optional(),
  proNumber: z.string().optional(),
  trackingNumber: z.string().optional(),
  packageCount: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  weightUOM: z.string().optional(),
  // 204
  equipmentType: z.string().optional(),
  specialInstructions: z.string().optional(),
  // 990
  loadResponseCode: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type FieldKey = keyof FormValues;

const DOC_TYPE_FIELDS: Record<string, FieldKey[]> = {
  "850": ["poNumber", "shipDate", "deliveryDate", "paymentTerms", "currencyCode", "lineItems"],
  "855": ["poNumber", "referenceNumber", "ackStatus"],
  "856": ["poNumber", "referenceNumber", "shipDate", "carrierName", "proNumber", "trackingNumber", "packageCount", "weight", "weightUOM", "lineItems"],
  "810": ["poNumber", "referenceNumber", "invoiceNumber", "invoiceDueDate", "paymentTerms", "currencyCode", "shipDate", "lineItems"],
  "204": ["referenceNumber", "shipDate", "deliveryDate", "equipmentType", "weight", "weightUOM", "specialInstructions"],
  "990": ["referenceNumber", "loadResponseCode"],
};

const FIELD_LABELS: Partial<Record<FieldKey, string>> = {
  poNumber: "PO Number",
  referenceNumber: "Reference #",
  shipDate: "Ship Date",
  deliveryDate: "Delivery Date",
  paymentTerms: "Payment Terms",
  currencyCode: "Currency Code",
  invoiceNumber: "Invoice Number",
  invoiceDueDate: "Invoice Due Date",
  carrierName: "Carrier Name",
  proNumber: "PRO Number",
  trackingNumber: "Tracking Number",
  packageCount: "Package Count",
  weight: "Weight",
  weightUOM: "Weight UOM",
  equipmentType: "Equipment Type",
  specialInstructions: "Special Instructions",
};

const FIELD_PLACEHOLDERS: Partial<Record<FieldKey, string>> = {
  poNumber: "PO-2025-001",
  referenceNumber: "REF-001",
  paymentTerms: "Net 30",
  currencyCode: "USD",
  invoiceNumber: "INV-001",
  carrierName: "FedEx Freight",
  proNumber: "PRO-123456",
  trackingNumber: "1Z999AA1012345678",
  packageCount: "12",
  weight: "2400",
  weightUOM: "LB",
  equipmentType: "53",
  specialInstructions: "Handle with care — fragile cargo",
};

const SELECT_FIELDS: Partial<Record<FieldKey, Array<{ value: string; label: string }>>> = {
  ackStatus: [
    { value: "AC", label: "AC — Accepted" },
    { value: "RJ", label: "RJ — Rejected" },
    { value: "PA", label: "PA — Partial Accept" },
  ],
  loadResponseCode: [
    { value: "A", label: "A — Accept" },
    { value: "D", label: "D — Decline" },
  ],
};

const DATE_FIELDS: FieldKey[] = ["shipDate", "deliveryDate", "invoiceDueDate"];
const TEXTAREA_FIELDS: FieldKey[] = ["specialInstructions"];
const NUMBER_FIELDS: FieldKey[] = ["packageCount", "weight"];

export default function DocumentNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [x12Preview, setX12Preview] = useState<string | null>(null);

  const { data: companies } = useListCompanies();
  const createDoc = useCreateEdiDocument();
  const sendDoc = useSendEdiDocument();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { documentType: "", direction: "outbound", senderId: "", receiverId: "", lineItems: [], currencyCode: "USD", weightUOM: "LB", ackStatus: "AC", loadResponseCode: "A" },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lineItems" });
  const docType = form.watch("documentType");
  const showFields = DOC_TYPE_FIELDS[docType] ?? [];

  async function handleSubmit(values: FormValues, action: "draft" | "ready" | "send") {
    const totalAmount = values.lineItems?.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const payload = {
      ...values,
      status: action === "send" ? "ready" : action,
      lineItems: values.lineItems?.length ? JSON.stringify(values.lineItems) : undefined,
      totalAmount: totalAmount || undefined,
    };

    try {
      const doc = await createDoc.mutateAsync({ data: payload as never });
      setX12Preview(doc.x12Content ?? null);
      queryClient.invalidateQueries({ queryKey: getListEdiDocumentsQueryKey() });

      if (action === "send") {
        await sendDoc.mutateAsync({ id: doc.id } as never);
        toast({ title: "Document sent", description: "EDI document queued for delivery" });
      } else {
        toast({ title: "Document saved", description: `Saved as ${action}` });
      }
      setLocation(`/documents/${doc.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to create document", variant: "destructive" });
    }
  }

  const isPending = createDoc.isPending || sendDoc.isPending;

  function renderField(key: FieldKey) {
    if (key === "lineItems") return null;

    if (SELECT_FIELDS[key]) {
      return (
        <FormField key={key} control={form.control} name={key as never} render={({ field }) => (
          <FormItem>
            <FormLabel>{FIELD_LABELS[key] ?? key}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value as string}>
              <FormControl>
                <SelectTrigger data-testid={`select-${key}`}>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SELECT_FIELDS[key]!.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      );
    }

    if (TEXTAREA_FIELDS.includes(key)) {
      return (
        <FormField key={key} control={form.control} name={key as never} render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>{FIELD_LABELS[key] ?? key}</FormLabel>
            <FormControl>
              <Textarea data-testid={`textarea-${key}`} placeholder={FIELD_PLACEHOLDERS[key]} rows={2} value={field.value as string} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      );
    }

    return (
      <FormField key={key} control={form.control} name={key as never} render={({ field }) => (
        <FormItem>
          <FormLabel>{FIELD_LABELS[key] ?? key}</FormLabel>
          <FormControl>
            <Input
              data-testid={`input-${key}`}
              type={DATE_FIELDS.includes(key) ? "date" : NUMBER_FIELDS.includes(key) ? "number" : "text"}
              placeholder={FIELD_PLACEHOLDERS[key]}
              {...field}
              value={field.value as string}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/documents" data-testid="btn-back" className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">EDI Document Builder</h1>
          <p className="text-muted-foreground text-sm">Create and send X12 EDI documents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Form {...form}>
          <form className="space-y-4">
            {/* Document Type & Direction */}
            <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Document Type</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="documentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Set</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-document-type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="850">EDI 850 – Purchase Order</SelectItem>
                        <SelectItem value="855">EDI 855 – PO Acknowledgment</SelectItem>
                        <SelectItem value="856">EDI 856 – Ship Notice (ASN)</SelectItem>
                        <SelectItem value="810">EDI 810 – Invoice</SelectItem>
                        <SelectItem value="204">EDI 204 – Load Tender</SelectItem>
                        <SelectItem value="990">EDI 990 – Load Response</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="direction" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-direction">
                          <SelectValue placeholder="Direction" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Partners */}
            <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Trading Partners</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="senderId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-sender">
                          <SelectValue placeholder="Select sender..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies?.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span>{c.name}</span>
                            {(c.city || c.state) && (
                              <span className="text-muted-foreground ml-1 text-xs">· {[c.city, c.state].filter(Boolean).join(", ")}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="receiverId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Receiver</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-receiver">
                          <SelectValue placeholder="Select receiver..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies?.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span>{c.name}</span>
                            {(c.city || c.state) && (
                              <span className="text-muted-foreground ml-1 text-xs">· {[c.city, c.state].filter(Boolean).join(", ")}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Dynamic doc-type-specific fields */}
            {docType && showFields.filter(f => f !== "lineItems").length > 0 && (
              <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Document Details
                  <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono normal-case tracking-normal">EDI {docType}</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {showFields.filter(f => f !== "lineItems").map(renderField)}
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea data-testid="textarea-notes" placeholder="Optional notes..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {/* Line Items */}
            {showFields.includes("lineItems") && (
              <div className="bg-card border border-card-border rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Line Items</h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="btn-add-line-item"
                    onClick={() => append({ description: "", quantity: 1, unitPrice: 0, uom: "EA" })}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} data-testid={`line-item-${index}`} className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">Item {index + 1}</span>
                      <Button type="button" variant="ghost" size="sm" data-testid={`btn-remove-item-${index}`} onClick={() => remove(index)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                    <FormField control={form.control} name={`lineItems.${index}.description`} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Description</FormLabel>
                        <FormControl><Input placeholder="Coffee Beans" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-3 gap-2">
                      <FormField control={form.control} name={`lineItems.${index}.quantity`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Qty</FormLabel>
                          <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`lineItems.${index}.uom`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">UOM</FormLabel>
                          <FormControl><Input placeholder="EA" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`lineItems.${index}.unitPrice`} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Unit Price</FormLabel>
                          <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isPending} data-testid="btn-save-draft" onClick={form.handleSubmit(v => handleSubmit(v, "draft"))}>
                Save Draft
              </Button>
              <Button type="button" variant="secondary" disabled={isPending} data-testid="btn-mark-ready" onClick={form.handleSubmit(v => handleSubmit(v, "ready"))}>
                Mark Ready
              </Button>
              <Button type="button" disabled={isPending} data-testid="btn-send" onClick={form.handleSubmit(v => handleSubmit(v, "send"))}>
                {isPending ? "Sending..." : "Send Now"}
              </Button>
            </div>
          </form>
        </Form>

        {/* X12 Preview Panel */}
        <div className="bg-card border border-card-border rounded-lg p-5 h-fit lg:sticky lg:top-4 hidden lg:block">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">X12 EDI Preview</h2>
          </div>
          {x12Preview ? (
            <pre className="text-[11px] font-mono text-foreground bg-muted/60 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-96">
              {x12Preview}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Eye className="w-8 h-8 opacity-20" />
              <p className="text-xs">X12 preview will appear here after saving</p>
              {docType && (
                <p className="text-[10px] text-center max-w-[200px] opacity-70">
                  EDI {docType} will include N1/N3/N4 address segments from company profiles
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
