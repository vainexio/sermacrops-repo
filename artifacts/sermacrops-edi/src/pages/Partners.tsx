import { useState } from "react";
import { useListPartnerEndpoints, getListPartnerEndpointsQueryKey, useCreatePartnerEndpoint, useUpdatePartnerEndpoint, useDeletePartnerEndpoint, useListCompanies } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Globe, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const schema = z.object({
  companyId: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  url: z.string().url("Must be a valid URL"),
  authType: z.string().min(1, "Required"),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  customHeaders: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function Partners() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useListPartnerEndpoints();
  const { data: companies } = useListCompanies();
  const create = useCreatePartnerEndpoint();
  const update = useUpdatePartnerEndpoint();
  const del = useDeletePartnerEndpoint();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { companyId: "", name: "", url: "", authType: "none" },
  });

  const authType = form.watch("authType");

  function openCreate() {
    setEditId(null);
    form.reset({ companyId: "", name: "", url: "", authType: "none" });
    setOpen(true);
  }

  function openEdit(ep: NonNullable<typeof endpoints>[0]) {
    setEditId(ep.id);
    form.reset({
      companyId: ep.companyId,
      name: ep.name,
      url: ep.url,
      authType: ep.authType,
      apiKey: ep.apiKey ?? "",
      bearerToken: ep.bearerToken ?? "",
      customHeaders: ep.customHeaders ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editId) {
        await update.mutateAsync({ id: editId, data: values } as never);
        toast({ title: "Endpoint updated" });
      } else {
        await create.mutateAsync({ data: values as never });
        toast({ title: "Endpoint created" });
      }
      queryClient.invalidateQueries({ queryKey: getListPartnerEndpointsQueryKey() });
      setOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save endpoint", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this endpoint?")) return;
    await del.mutateAsync({ id } as never);
    queryClient.invalidateQueries({ queryKey: getListPartnerEndpointsQueryKey() });
    toast({ title: "Deleted" });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5" /> Partner Endpoints
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Configure outbound delivery endpoints for each trading partner</p>
        </div>
        <Button data-testid="btn-add-endpoint" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Endpoint
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      {!isLoading && endpoints?.length === 0 && (
        <div className="bg-card border border-card-border rounded-lg p-12 text-center text-muted-foreground">
          <Globe className="w-10 h-10 opacity-20 mx-auto mb-3" />
          <p className="font-medium">No endpoints configured</p>
          <p className="text-sm mt-1">Add partner endpoints to enable outbound EDI delivery</p>
        </div>
      )}

      <div className="space-y-3">
        {endpoints?.map(ep => (
          <div key={ep.id} data-testid={`endpoint-card-${ep.id}`} className="bg-card border border-card-border rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">{ep.name}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ep.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {ep.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{ep.authType}</span>
                </div>
                <p className="text-sm text-muted-foreground">{ep.companyName}</p>
                <p className="text-xs font-mono text-foreground mt-1 truncate">{ep.url}</p>
              </div>
              <div className="flex gap-1.5 ml-4">
                <Button variant="ghost" size="sm" data-testid={`btn-edit-endpoint-${ep.id}`} onClick={() => openEdit(ep)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" data-testid={`btn-delete-endpoint-${ep.id}`} onClick={() => handleDelete(ep.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Endpoint" : "Add Partner Endpoint"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="companyId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Partner Company</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-ep-company"><SelectValue placeholder="Select company..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint Name</FormLabel>
                  <FormControl><Input data-testid="input-ep-name" placeholder="Production EDI Receiver" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl><Input data-testid="input-ep-url" placeholder="https://partner.example.com/edi/receive" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="authType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Auth Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-ep-auth"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Auth</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="bearer_token">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              {authType === "api_key" && (
                <FormField control={form.control} name="apiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl><Input data-testid="input-ep-apikey" type="password" placeholder="sk-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {authType === "bearer_token" && (
                <FormField control={form.control} name="bearerToken" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bearer Token</FormLabel>
                    <FormControl><Input data-testid="input-ep-token" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="customHeaders" render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Headers (JSON)</FormLabel>
                  <FormControl><Input data-testid="input-ep-headers" placeholder='{"X-Custom": "value"}' {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="btn-save-endpoint" disabled={create.isPending || update.isPending}>
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
