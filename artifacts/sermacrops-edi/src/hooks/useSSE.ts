import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiBase } from "@/lib/api";
import {
  getListEdiDocumentsQueryKey,
  getListInboundMessagesQueryKey,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetOrderTocashFlowQueryKey,
  getGetRecentActivityQueryKey,
  getGetDocumentStatsQueryKey,
} from "@workspace/api-client-react";

type SSEEvent = { type: string };

export function useSSE(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const url = `${apiBase}/api/events`;
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(url);

      es.onmessage = (event) => {
        try {
          const { type } = JSON.parse(event.data as string) as SSEEvent;
          switch (type) {
            case "procurement":
              queryClient.invalidateQueries({ queryKey: ["procurement"] });
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetOrderTocashFlowQueryKey() });
              break;
            case "inventory":
              queryClient.invalidateQueries({ queryKey: ["inventory"] });
              break;
            case "edi-document":
              queryClient.invalidateQueries({ queryKey: getListEdiDocumentsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
              break;
            case "inbound-message":
              queryClient.invalidateQueries({ queryKey: getListInboundMessagesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
              break;
            case "transaction":
              queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetOrderTocashFlowQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
              break;
            case "dashboard":
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetOrderTocashFlowQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connect, 3_000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [queryClient]);
}
