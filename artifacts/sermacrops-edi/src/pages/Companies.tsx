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
import { Building2, Plus, Edit2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const schema = z.object({
  name: z.string().min(1, "Required"),
  ediId: z.string().min(1, "Required"),
  type: z.string().min(1, "Required"),
  address: z.string().optional(),
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
    defaultValues: { name: "", ediId: "", type: "", address: "", contactEmail: "", contactPhone: "" },
  });

  function openCreate() {
    setEditId(null);
    form.reset({ name: "", ediId: "", type: "" });
    setOpen(true);
  }

  function openEdit(c: NonNullable<typeof companies>[0]) {
    setEditId(c.id);
    form.reset({ name: c.name, ediId: c.ediId, type: c.type, address: c.address ?? "", contactEmail: c.contactEmail ?? "", contactPhone: c.contactPhone ?? "" });
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
        {companies?.map(company => (
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
              {company.address && (
                <div className="flex gap-2">
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">Address</dt>
                  <dd className="text-xs text-foreground truncate">{company.address}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
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
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input data-testid="input-company-address" placeholder="123 Main St, City, State" {...field} /></FormControl>
                </FormItem>
              )} />
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
