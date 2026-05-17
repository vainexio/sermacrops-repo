import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Documents from "@/pages/Documents";
import DocumentNew from "@/pages/DocumentNew";
import DocumentDetail from "@/pages/DocumentDetail";
import Inbound from "@/pages/Inbound";
import Transactions from "@/pages/Transactions";
import Partners from "@/pages/Partners";
import Companies from "@/pages/Companies";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/documents/new" component={DocumentNew} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/documents" component={Documents} />
        <Route path="/inbound" component={Inbound} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/partners" component={Partners} />
        <Route path="/companies" component={Companies} />
        <Route path="/logs" component={Logs} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
