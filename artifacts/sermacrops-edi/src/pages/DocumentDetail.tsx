import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetEdiDocument, getGetEdiDocumentQueryKey, useSendEdiDocument, useDeleteEdiDocument, getListEdiDocumentsQueryKey, usePreviewEdiDocument, getPreviewEdiDocumentQueryKey } from "@workspace/api-client-react";
import type { SendRequestInfo } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge, { docTypeLabel } from "@/components/DocTypeBadge";
import { EdiDocumentCard } from "@/components/EdiDocumentCard";
import type { EdiDocumentData } from "@/components/EdiDocumentCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

function buildRequestCode(info: SendRequestInfo): string {
  const headerLines = Object.entries(info.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `${info.method} ${info.url} HTTP/1.1\n${headerLines}\n\n${info.body}`;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lastRequestInfo, setLastRequestInfo] = useState<SendRequestInfo | null>(null);
  const [requestPanelOpen, setRequestPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: doc, isLoading } = useGetEdiDocument(id, {
    query: { enabled: !!id, queryKey: getGetEdiDocumentQueryKey(id) },
  });
  const { data: preview } = usePreviewEdiDocument(id, {
    query: { enabled: !!id, queryKey: getPreviewEdiDocumentQueryKey(id) },
  });

  const sendDoc = useSendEdiDocument();
  const deleteDoc = useDeleteEdiDocument();

  async function handleSend() {
    try {
      const result = await sendDoc.mutateAsync({ id } as never);
      queryClient.invalidateQueries({ queryKey: getGetEdiDocumentQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListEdiDocumentsQueryKey() });
      if (result.requestInfo) {
        setLastRequestInfo(result.requestInfo);
        setRequestPanelOpen(true);
      }
      toast({ title: result.success ? "Sent successfully" : "Send failed", description: result.message, variant: result.success ? "default" : "destructive" });
    } catch {
      toast({ title: "Error", description: "Failed to send document", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this document?")) return;
    await deleteDoc.mutateAsync({ id } as never);
    queryClient.invalidateQueries({ queryKey: getListEdiDocumentsQueryKey() });
    setLocation("/documents");
    toast({ title: "Deleted" });
  }

  function handleCopy() {
    if (!lastRequestInfo) return;
    navigator.clipboard.writeText(buildRequestCode(lastRequestInfo)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLoading) return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-7 h-7 bg-muted rounded" />
          <div className="space-y-2 flex-1">
            <div className="flex gap-2">
              <div className="h-5 bg-muted rounded w-16" />
              <div className="h-5 bg-muted rounded w-20" />
            </div>
            <div className="h-6 bg-muted rounded w-48" />
            <div className="h-4 bg-muted rounded w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 bg-muted rounded w-20" />
          <div className="h-8 bg-muted rounded w-20" />
        </div>
      </div>
      <div className="bg-card border border-card-border rounded-lg p-5 space-y-3">
        <div className="h-4 bg-muted rounded w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between py-1 border-b border-border last:border-0">
            <div className="h-3 bg-muted rounded w-24" />
            <div className="h-3 bg-muted rounded w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-3">
          <div className="h-4 bg-muted rounded w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between py-1 border-b border-border last:border-0">
              <div className="h-3 bg-muted rounded w-20" />
              <div className="h-3 bg-muted rounded w-28" />
            </div>
          ))}
        </div>
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-3">
          <div className="h-4 bg-muted rounded w-28" />
          <div className="h-56 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
  if (!doc) return <div className="p-8 text-center text-muted-foreground">Document not found</div>;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/documents" data-testid="btn-back" className="p-1.5 rounded hover:bg-muted transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <DocTypeBadge type={doc.documentType} />
              <StatusBadge status={doc.status} />
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${doc.direction === "outbound" ? "bg-violet-100 text-violet-700" : "bg-cyan-100 text-cyan-700"}`}>
                {doc.direction}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">{docTypeLabel(doc.documentType)}</h1>
            <p className="text-sm text-muted-foreground">Control # {doc.controlNumber}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {["draft", "ready", "failed", "retry_pending"].includes(doc.status) && (
            <Button data-testid="btn-send-document" onClick={handleSend} disabled={sendDoc.isPending} size="sm">
              {sendDoc.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              {sendDoc.isPending ? "Sending..." : "Send"}
            </Button>
          )}
          <Button data-testid="btn-delete-document" variant="destructive" size="sm" onClick={handleDelete} disabled={deleteDoc.isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Outbound Request Preview Panel */}
      {lastRequestInfo && (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          <button
            onClick={() => setRequestPanelOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                {lastRequestInfo.method}
              </span>
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[500px]">{lastRequestInfo.url}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Outbound Request</span>
              {requestPanelOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>
          {requestPanelOpen && (
            <div className="border-t border-border relative">
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 z-10 p-1.5 rounded bg-muted/80 hover:bg-muted border border-border transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              <pre className="text-[11px] font-mono text-foreground bg-muted/40 p-5 pr-12 overflow-x-auto whitespace-pre leading-relaxed">
                <span className="text-violet-600 font-semibold">{lastRequestInfo.method}</span>{" "}
                <span className="text-blue-600">{lastRequestInfo.url}</span>{" "}
                <span className="text-muted-foreground">HTTP/1.1</span>{"\n"}
                {Object.entries(lastRequestInfo.headers).map(([key, val]) => (
                  <span key={key}>
                    <span className="text-amber-600">{key}</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-emerald-700">{val}</span>{"\n"}
                  </span>
                ))}
                {"\n"}
                <span className="text-foreground/70">{lastRequestInfo.body}</span>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* EDI Document Card — formatted document view */}
      <EdiDocumentCard doc={doc as unknown as EdiDocumentData} />

      {/* Bottom two-column: Delivery Status + X12 Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery Status */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-4">Delivery Status</h2>
          <dl className="space-y-2">
            {[
              { label: "Status", value: <StatusBadge status={doc.status} /> },
              { label: "Retry Count", value: String(doc.retryCount) },
              { label: "Sent At", value: doc.sentAt ? new Date(doc.sentAt).toLocaleString() : "—" },
              { label: "Delivered At", value: doc.deliveredAt ? new Date(doc.deliveredAt).toLocaleString() : "—" },
              { label: "Response Code", value: doc.lastResponseCode ? `HTTP ${doc.lastResponseCode}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xs font-medium text-foreground">{value}</dd>
              </div>
            ))}
            {doc.lastResponseBody && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Partner Response</p>
                <pre className={`text-xs font-mono rounded p-2 whitespace-pre-wrap break-all ${
                  doc.status === "failed" || doc.status === "retry_pending"
                    ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                    : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                }`}>
                  {(() => { try { return JSON.stringify(JSON.parse(doc.lastResponseBody), null, 2); } catch { return doc.lastResponseBody; } })()}
                </pre>
              </div>
            )}
          </dl>
        </div>

        {/* X12 EDI Content */}
        <div className="bg-card border border-card-border rounded-lg p-5 h-fit">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-3">X12 EDI Content</h2>
          <pre className="text-[11px] font-mono text-foreground bg-muted/60 rounded p-4 overflow-x-auto whitespace-pre-wrap max-h-[500px] border border-border">
            {preview?.content ?? doc.x12Content ?? "No X12 content available"}
          </pre>
        </div>
      </div>
    </div>
  );
}
