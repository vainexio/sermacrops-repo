import { useState } from "react";
import { useListInboundMessages, getListInboundMessagesQueryKey, useReceiveInbound, useListPartnerEndpoints, useDeleteInboundMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { EdiDocumentCard } from "@/components/EdiDocumentCard";
import { parseX12ToDocumentData } from "@/lib/parseX12";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Inbox, Upload, Copy, Check, ChevronDown, ChevronUp, Terminal, Lock, Unlock, Trash2 } from "lucide-react";

const BASE_URL = window.location.origin;
const INBOUND_URL = `${BASE_URL}/api/edi/inbound`;

const SAMPLE_BODY = `ISA*00*          *00*          *ZZ*COFFEESHOP   *ZZ*SERMACROPS   *260517*1200*^*00501*000000001*0*P*:~\nGS*PO*COFFEESHOP*SERMACROPS*20260517*1200*1*X*005010~\nST*850*0001~\nBEG*00*SA*PO-CS-2025-0099**20260517~\nSE*2*0001~\nGE*1*1~\nIEA*1*000000001~`;

const SAMPLE_BODY_RAW = `ISA*00*          *00*          *ZZ*COFFEESHOP   *ZZ*SERMACROPS   *260517*1200*^*00501*000000001*0*P*:~
GS*PO*COFFEESHOP*SERMACROPS*20260517*1200*1*X*005010~
ST*850*0001~
BEG*00*SA*PO-CS-2025-0099**20260517~
SE*2*0001~
GE*1*1~
IEA*1*000000001~`;

function buildAuthLines(authType: string, apiKey?: string | null, bearerToken?: string | null): string[] {
  if (authType === "api_key" && apiKey) return [`  -H "x-api-key: ${apiKey}" \\`];
  if (authType === "bearer_token" && bearerToken) return [`  -H "Authorization: Bearer ${bearerToken}" \\`];
  if (authType === "basic" && apiKey) return [`  -H "Authorization: Basic ${apiKey}" \\`];
  return [];
}

function buildCurlJson(authLines: string[]): string {
  const auth = authLines.length ? authLines.join("\n") + "\n" : "";
  return `curl -X POST "${INBOUND_URL}" \\\n  -H "Content-Type: application/json" \\\n${auth}  -d '{"x12Content":"${SAMPLE_BODY}"}'`;
}

function buildCurlRaw(authLines: string[]): string {
  const auth = authLines.length ? authLines.join("\n") + "\n" : "";
  return `curl -X POST "${INBOUND_URL}" \\\n  -H "Content-Type: application/EDI-X12" \\\n${auth}  --data-raw "${SAMPLE_BODY_RAW}"`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function Inbound() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [showEndpointInfo, setShowEndpointInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<"json" | "raw">("json");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: deleteMsg, isPending: isDeleting } = useDeleteInboundMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInboundMessagesQueryKey() });
        setSelected(null);
        setConfirmDelete(false);
        toast({ title: "Message deleted" });
      },
      onError: () => toast({ title: "Failed to delete message", variant: "destructive" }),
    },
  });

  // Find SERMACROPS's own inbound endpoint to know what auth partners must send
  const { data: allEndpoints } = useListPartnerEndpoints();
  const sermacropsEndpoint = allEndpoints?.find(ep =>
    /sermacrops/i.test(ep.companyName ?? "") && ep.isActive
  );
  const authType = sermacropsEndpoint?.authType ?? "none";
  const authLines = sermacropsEndpoint
    ? buildAuthLines(authType, sermacropsEndpoint.apiKey, sermacropsEndpoint.bearerToken)
    : [];
  const curlJson = buildCurlJson(authLines);
  const curlRaw = buildCurlRaw(authLines);

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
      toast({
        title: result.success ? "Message received" : "Received with errors",
        description: result.errors.join(", ") || `Type: ${result.documentType ?? "unknown"} · From: ${result.sender ?? "?"}`,
      });
      setRawInput("");
      setShowSubmit(false);
    } catch {
      toast({ title: "Error", description: "Failed to submit inbound message", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="flex flex-col w-full lg:w-[440px] xl:w-[480px] border-r border-border shrink-0 overflow-y-auto">

        {/* Endpoint info card */}
        <div className="border-b border-border bg-muted/20">
          <button
            onClick={() => setShowEndpointInfo(!showEndpointInfo)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-foreground">Your Receiving Endpoint</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded font-semibold uppercase tracking-wide">LIVE</span>
            </div>
            {showEndpointInfo ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showEndpointInfo && (
            <div className="px-4 pb-4 space-y-4">
              {/* URL */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">Endpoint URL</p>
                <div className="flex items-center gap-2 bg-card border border-border rounded px-3 py-2">
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded uppercase tracking-wide">POST</span>
                  <code className="text-xs font-mono text-foreground flex-1 truncate">{INBOUND_URL}</code>
                  <CopyButton text={INBOUND_URL} />
                </div>
              </div>

              {/* Requirements */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">Accepted Content-Types</p>
                  <div className="space-y-1">
                    <code className="text-[11px] font-mono bg-muted/60 rounded px-1.5 py-0.5 block">application/json</code>
                    <code className="text-[11px] font-mono bg-muted/60 rounded px-1.5 py-0.5 block">application/EDI-X12</code>
                    <code className="text-[11px] font-mono bg-muted/60 rounded px-1.5 py-0.5 block">text/plain</code>
                  </div>
                </div>
                <div className="bg-card border border-border rounded p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">ISA Receiver ID</p>
                  <code className="text-sm font-mono font-bold text-foreground">SERMACROPS</code>
                  <p className="text-[10px] text-muted-foreground mt-1">Must match in ISA*08 field</p>
                  <p className="text-[10px] text-muted-foreground mt-2 font-medium">ISA Qualifier</p>
                  <code className="text-xs font-mono text-foreground">ZZ</code>
                </div>
              </div>

              {/* Code examples */}
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Example — Partners Send</p>
                  {authType === "none" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                      <Unlock className="w-2.5 h-2.5" /> No Auth Required
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold uppercase tracking-wide">
                      <Lock className="w-2.5 h-2.5" />
                      {authType === "api_key" ? "API Key" : authType === "bearer_token" ? "Bearer Token" : authType === "basic" ? "Basic Auth" : authType}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mb-2">
                  {(["json", "raw"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab === "json" ? "JSON body" : "Raw EDI-X12"}
                    </button>
                  ))}
                </div>
                <div className="relative bg-[#0f1117] rounded border border-border">
                  <div className="absolute top-2 right-2">
                    <CopyButton text={activeTab === "json" ? curlJson : curlRaw} />
                  </div>
                  <pre className="text-[10px] font-mono text-green-400 p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                    {activeTab === "json" ? curlJson : curlRaw}
                  </pre>
                </div>
              </div>

              {/* Response format */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">Response from SERMACROPS</p>
                <pre className="text-[10px] font-mono bg-muted/60 rounded p-3 border border-border text-foreground overflow-x-auto">{`{
  "success": true,
  "messageId": "6a09b9...",
  "documentType": "850",
  "sender": "Coffee Shop Co.",
  "receiver": "SERMACROPS Manufacturing",
  "errors": []
}`}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="p-4 space-y-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Received Messages
            </h1>
            <Button size="sm" variant="outline" data-testid="btn-submit-raw" onClick={() => setShowSubmit(!showSubmit)}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Test Submit
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

        {/* Message list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
          {!isLoading && messages?.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No inbound messages yet</div>
          )}
          {messages?.map(msg => (
            <div key={msg.id}>
              <button
                data-testid={`inbound-item-${msg.id}`}
                onClick={() => setSelected(msg.id === selected ? null : msg.id)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-2 ${selected === msg.id ? "bg-muted" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    {msg.documentType ? <DocTypeBadge type={msg.documentType} /> : <span className="text-xs text-muted-foreground italic">Unknown Type</span>}
                    <StatusBadge status={msg.status} />
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">
                    {msg.senderName ?? "Unknown"} → {msg.receiverName ?? "Unknown"}
                  </p>
                  {msg.controlNumber && <p className="text-[10px] text-muted-foreground">Control #{msg.controlNumber}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(msg.createdAt).toLocaleString()}</p>
                </div>
                <ChevronDown className={`lg:hidden shrink-0 w-4 h-4 mt-1 text-muted-foreground transition-transform ${selected === msg.id ? "rotate-180" : ""}`} />
              </button>

              {/* Inline mobile detail */}
              {selected === msg.id && selectedMsg && (
                <div className="lg:hidden border-t border-border bg-background p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Sender", value: selectedMsg.senderName },
                      { label: "Receiver", value: selectedMsg.receiverName },
                      { label: "Control #", value: selectedMsg.controlNumber },
                      { label: "Received", value: new Date(selectedMsg.createdAt).toLocaleString() },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="bg-muted/40 rounded p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                        <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
                      </div>
                    ) : null)}
                  </div>
                  {selectedMsg.validationErrors && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Validation Errors</p>
                      {(() => { try { return JSON.parse(selectedMsg.validationErrors); } catch { return [selectedMsg.validationErrors]; } })().map((e: string, i: number) => (
                        <p key={i} className="text-xs text-red-600 dark:text-red-400">• {e}</p>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Raw X12 Payload</p>
                    <pre className="text-[11px] font-mono bg-white text-black rounded p-3 overflow-x-auto whitespace-pre-wrap border border-border max-h-48">
                      {selectedMsg.rawPayload}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right detail panel */}
      <div className="flex-1 hidden lg:block overflow-y-auto">
        {selectedMsg ? (() => {
          const parsedDoc = parseX12ToDocumentData(selectedMsg.rawPayload, {
            documentType: selectedMsg.documentType,
            controlNumber: selectedMsg.controlNumber,
            senderName: selectedMsg.senderName,
            receiverName: selectedMsg.receiverName,
            status: selectedMsg.status,
            createdAt: selectedMsg.createdAt,
          });
          return (
            <div className="p-6 space-y-5">
              {/* Message meta strip */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span>Message ID: <span className="font-mono text-foreground">{selectedMsg.id}</span></span>
                  <span>·</span>
                  <span>Received: <span className="text-foreground">{new Date(selectedMsg.createdAt).toLocaleString()}</span></span>
                  {selectedMsg.processedAt && (
                    <>
                      <span>·</span>
                      <span>Processed: <span className="text-foreground">{new Date(selectedMsg.processedAt).toLocaleString()}</span></span>
                    </>
                  )}
                </div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">Delete this message?</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={isDeleting} onClick={() => deleteMsg({ id: selectedMsg.id })}>
                      {isDeleting ? "Deleting…" : "Confirm"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                )}
              </div>

              {/* Full EdiDocumentCard with all parsed details */}
              <EdiDocumentCard doc={parsedDoc} />

              {/* Validation errors (shown separately if present) */}
              {selectedMsg.validationErrors && (
                <div className="border border-red-200 dark:border-red-800 rounded-lg px-5 py-4 bg-red-50/50 dark:bg-red-900/10">
                  <p className="text-[10px] text-red-700 dark:text-red-400 uppercase tracking-widest font-semibold mb-2">Validation Errors</p>
                  {((): string[] => { try { return JSON.parse(selectedMsg.validationErrors!); } catch { return [selectedMsg.validationErrors!]; } })().map((e, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">•</span>{e}
                    </p>
                  ))}
                </div>
              )}

              {/* Raw X12 Payload */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Raw X12 Payload</p>
                <pre className="text-[11px] font-mono bg-white text-black rounded p-4 overflow-x-auto whitespace-pre-wrap border border-border max-h-72 leading-relaxed">
                  {selectedMsg.rawPayload}
                </pre>
              </div>
            </div>
          );
        })() : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Inbox className="w-10 h-10 opacity-20" />
            <p className="text-sm">Select a message to inspect its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
