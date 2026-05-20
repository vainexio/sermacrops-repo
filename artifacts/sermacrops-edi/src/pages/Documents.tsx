import { useState } from "react";
import { useListEdiDocuments, getListEdiDocumentsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import StatusBadge from "@/components/StatusBadge";
import DocTypeBadge from "@/components/DocTypeBadge";
import { EdiDocumentCard } from "@/components/EdiDocumentCard";
import type { EdiDocumentData } from "@/components/EdiDocumentCard";
import { Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Documents() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const params = {
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(dirFilter !== "all" ? { direction: dirFilter } : {}),
    ...(typeFilter !== "all" ? { documentType: typeFilter } : {}),
  };

  const { data: docs, isLoading } = useListEdiDocuments(params, {
    query: { queryKey: getListEdiDocumentsQueryKey(params) },
  });

  const filtered = docs?.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.senderName?.toLowerCase().includes(q) ||
      d.receiverName?.toLowerCase().includes(q) ||
      d.referenceNumber?.toLowerCase().includes(q) ||
      d.poNumber?.toLowerCase().includes(q) ||
      d.controlNumber?.toLowerCase().includes(q)
    );
  }) ?? [];

  const selectedDoc = filtered.find(d => d.id === selected);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="flex flex-col w-full lg:w-96 xl:w-[420px] border-r border-border shrink-0">
        {/* Toolbar */}
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-foreground">EDI Documents</h1>
            <Link
              href="/documents/new"
              data-testid="btn-new-document"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-testid="input-search-documents"
              type="search"
              placeholder="Search documents..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={dirFilter} onValueChange={setDirFilter}>
              <SelectTrigger data-testid="select-direction-filter" className="h-7 text-xs flex-1">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter" className="h-7 text-xs flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retry_pending">Retry</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter" className="h-7 text-xs flex-1">
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

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No documents found</div>
          )}
          {filtered.map(doc => (
            <button
              key={doc.id}
              data-testid={`doc-item-${doc.id}`}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setLocation(`/documents/${doc.id}`);
                } else {
                  setSelected(doc.id === selected ? null : doc.id);
                }
              }}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selected === doc.id ? "bg-muted" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <DocTypeBadge type={doc.documentType} />
                <StatusBadge status={doc.status} />
              </div>
              <p className="text-sm font-medium text-foreground truncate">{doc.senderName} → {doc.receiverName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">{doc.referenceNumber ?? doc.controlNumber}</span>
                {doc.totalAmount != null && (
                  <span className="text-xs font-semibold text-foreground">${doc.totalAmount.toLocaleString()}</span>
                )}
                <span className={`text-xs ${doc.direction === "outbound" ? "text-violet-600" : "text-cyan-600"}`}>
                  {doc.direction}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(doc.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right detail panel */}
      <div className="flex-1 hidden lg:flex flex-col overflow-y-auto">
        {selectedDoc ? (
          <div className="p-6 space-y-4">
            {/* Open Full button */}
            <div className="flex justify-end">
              <button
                data-testid="btn-open-full"
                onClick={() => setLocation(`/documents/${selectedDoc.id}`)}
                className="px-3 py-1.5 border border-border rounded text-xs font-medium hover:bg-muted transition-colors"
              >
                Open Full
              </button>
            </div>

            {/* Formatted document card */}
            <EdiDocumentCard doc={selectedDoc as unknown as EdiDocumentData} />

            {/* X12 EDI Preview */}
            {selectedDoc.x12Content && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">X12 EDI Preview</p>
                <pre className="bg-muted/60 rounded p-4 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap border border-border max-h-64">
                  {selectedDoc.x12Content}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 p-8">
            <Filter className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select a document to view details</p>
            <Link href="/documents/new" data-testid="btn-create-first" className="text-sm text-blue-500 hover:underline">or create a new document</Link>
          </div>
        )}
      </div>
    </div>
  );
}
