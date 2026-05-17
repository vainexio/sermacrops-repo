import { useState } from "react";
import { useListCompanies, getListCompaniesQueryKey, useCreateCompany, useUpdateCompany, useDeleteCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Edit2, Trash2, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const schema = z.object({
  name: z.string().min(1, "Required"),
  ediId: z.string().min(1, "Required"),
  type: z.string().min(1, "Required"),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2, "2-letter code").optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const TYPE_LABELS: Record<string, string> = {
  manufacturer: "Manufacturer",
  buyer: "Buyer / Customer",
  supplier: "Raw Materials Supplier",
  logistics: "Logistics / 3PL",
};

function formatAddress(c: { addressLine1?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null }): string | null {
  const parts = [c.addressLine1, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean);
  if (c.country && c.country !== "US") parts.push(c.country);
  return parts.length ? parts.join(" · ") : null;
}

export default function Companies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: companies, isLoading } = useListCompanies();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const del = useDeleteCompany();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", ediId: "", type: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", country: "US", contactEmail: "", contactPhone: "" },
  });

  function openCreate() {
    setEditId(null);
    form.reset({ name: "", ediId: "", type: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", country: "US", contactEmail: "", contactPhone: "" });
    setOpen(true);
  }

  function openEdit(c: NonNullable<typeof companies>[0]) {
    setEditId(c.id);
    form.reset({
      name: c.name,
      ediId: c.ediId,
      type: c.type,
      addressLine1: c.addressLine1 ?? "",
      addressLine2: c.addressLine2 ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zip: c.zip ?? "",
      country: c.country ?? "US",
      contactEmail: c.contactEmail ?? "",
      contactPhone: c.contactPhone ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editId) {
        await update.mutateAsync({ id: editId, data: values } as never);
        toast({ title: "Company updated" });
      } else {
        await create.mutateAsync({ data: values as never });
        toast({ title: "Company created" });
      }
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save company", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this company?")) return;
    await del.mutateAsync({ id } as never);
    queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
    toast({ title: "Deleted" });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Companies
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage trading partner company profiles and EDI identifiers</p>
        </div>
        <Button data-testid="btn-add-company" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Company
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-5 animate-pulse h-32" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companies?.map(company => {
          const addr = formatAddress(company);
          return (
            <div key={company.id} data-testid={`company-card-${company.id}`} className="bg-card border border-card-border rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-foreground">{company.name}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${company.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {company.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{TYPE_LABELS[company.type] ?? company.type}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" data-testid={`btn-edit-company-${company.id}`} onClick={() => openEdit(company)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" data-testid={`btn-delete-company-${company.id}`} onClick={() => handleDelete(company.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <dl className="space-y-1">
                <div className="flex gap-2">
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">EDI ID</dt>
                  <dd className="text-xs font-mono font-medium text-foreground">{company.ediId}</dd>
                </div>
                {company.contactEmail && (
                  <div className="flex gap-2">
                    <dt className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">Email</dt>
                    <dd className="text-xs text-foreground truncate">{company.contactEmail}</dd>
                  </div>
                )}
                {addr && (
                  <div className="flex gap-2">
                    <dt className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0 flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" /> Addr
                    </dt>
                    <dd className="text-xs text-foreground truncate">{addr}</dd>
                  </div>
                )}
              </dl>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Company" : "Add Company"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl><Input data-testid="input-company-name" placeholder="Coffee Shop Inc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ediId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>EDI ID / ISA ID</FormLabel>
                    <FormControl><Input data-testid="input-edi-id" placeholder="COFFEESHOP01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-company-type"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="manufacturer">Manufacturer</SelectItem>
                      <SelectItem value="buyer">Buyer / Customer</SelectItem>
                      <SelectItem value="supplier">Raw Materials Supplier</SelectItem>
                      <SelectItem value="logistics">Logistics / 3PL</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address (used in EDI N1/N3/N4 segments)</p>
                <FormField control={form.control} name="addressLine1" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl><Input data-testid="input-address-line1" placeholder="123 Commerce Blvd" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="addressLine2" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Suite / Unit</FormLabel>
                    <FormControl><Input data-testid="input-address-line2" placeholder="Suite 400" {...field} /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input data-testid="input-city" placeholder="Miami" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="state" render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input data-testid="input-state" placeholder="FL" maxLength={2} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="zip" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl><Input data-testid="input-zip" placeholder="33101" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl><Input data-testid="input-country" placeholder="US" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl><Input data-testid="input-company-email" type="email" placeholder="edi@company.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input data-testid="input-company-phone" placeholder="+1 (555) 000-0000" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="btn-save-company" disabled={create.isPending || update.isPending}>
                  {create.isPending || update.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
