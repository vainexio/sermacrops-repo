import { useState } from "react";
import { useListInboundMessages, getListInboundMessagesQueryKey, useReceiveInbound } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Inbox, Upload } from "lucide-react";

export default function Inbound() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(typeFilter !== "all" ? { documentType: typeFilter } : {}),
  };

  const { data: messages, isLoading } = useListInboundMessages(params, {
    query: { queryKey: getListInboundMessagesQueryKey(params) },
  });

  const receiveInbound = useReceiveInbound();
  const selectedMsg = messages?.find(m => m.id === selected);

  async function handleSubmitRaw() {
    if (!rawInput.trim()) return;
    try {
      const result = await receiveInbound.mutateAsync({ data: { x12Content: rawInput } });
      queryClient.invalidateQueries({ queryKey: getListInboundMessagesQueryKey() });
      toast({ title: result.success ? "Message received" : "Received with errors", description: result.errors.join(", ") || "Processed successfully" });
      setRawInput("");
      setShowSubmit(false);
    } catch {
      toast({ title: "Error", description: "Failed to submit inbound message", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col w-full lg:w-96 xl:w-[420px] border-r border-border shrink-0">
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Inbound Messages
            </h1>
            <Button size="sm" variant="outline" data-testid="btn-submit-raw" onClick={() => setShowSubmit(!showSubmit)}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Submit X12
            </Button>
          </div>
          {showSubmit && (
            <div className="space-y-2">
              <Textarea
                data-testid="textarea-raw-x12"
                placeholder="Paste raw X12 EDI payload here..."
                rows={4}
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                className="font-mono text-xs"
              />
              <Button size="sm" data-testid="btn-process-inbound" disabled={receiveInbound.isPending || !rawInput.trim()} onClick={handleSubmitRaw}>
                {receiveInbound.isPending ? "Processing..." : "Process"}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-inbound-status" className="h-7 text-xs flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-inbound-type" className="h-7 text-xs flex-1">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {["850","855","856","810","204","990"].map(t => (
                  <SelectItem key={t} value={t}>EDI {t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
          {!isLoading && messages?.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No inbound messages</div>
          )}
          {messages?.map(msg => (
            <button
              key={msg.id}
              data-testid={`inbound-item-${msg.id}`}
              onClick={() => setSelected(msg.id === selected ? null : msg.id)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selected === msg.id ? "bg-muted" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                {msg.documentType ? <DocTypeBadge type={msg.documentType} /> : <span className="text-xs text-muted-foreground">Unknown Type</span>}
                <StatusBadge status={msg.status} />
              </div>
              <p className="text-sm font-medium text-foreground truncate">
                {msg.senderName ?? "Unknown"} → {msg.receiverName ?? "Unknown"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(msg.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 hidden lg:block overflow-y-auto">
        {selectedMsg ? (
          <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {selectedMsg.documentType && <DocTypeBadge type={selectedMsg.documentType} />}
                <StatusBadge status={selectedMsg.status} />
              </div>
              <h2 className="text-lg font-bold text-foreground">Inbound Message</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Sender", value: selectedMsg.senderName },
                { label: "Receiver", value: selectedMsg.receiverName },
                { label: "Control #", value: selectedMsg.controlNumber },
                { label: "Received", value: new Date(selectedMsg.createdAt).toLocaleString() },
                { label: "Processed", value: selectedMsg.processedAt ? new Date(selectedMsg.processedAt).toLocaleString() : null },
              ].map(({ label, value }) => value ? (
                <div key={label} className="bg-muted/40 rounded p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                </div>
              ) : null)}
            </div>
            {selectedMsg.validationErrors && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Validation Errors</p>
                {JSON.parse(selectedMsg.validationErrors).map((e: string, i: number) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Raw X12 Payload</p>
              <pre className="text-[11px] font-mono bg-muted/60 rounded p-4 overflow-x-auto whitespace-pre-wrap border border-border max-h-72">
                {selectedMsg.rawPayload}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground">
            <Inbox className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-sm">Select a message to inspect</p>
          </div>
        )}
      </div>
    </div>
  );
}
