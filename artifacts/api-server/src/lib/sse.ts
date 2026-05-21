import type { Response } from "express";

type SSEClient = { id: number; res: Response };

let nextId = 1;
const clients = new Map<number, SSEClient>();

export function addSSEClient(res: Response): number {
  const id = nextId++;
  clients.set(id, { id, res });
  return id;
}

export function removeSSEClient(id: number): void {
  clients.delete(id);
}

export type SSEEventType =
  | "procurement"
  | "inventory"
  | "edi-document"
  | "inbound-message"
  | "transaction"
  | "dashboard";

export function broadcast(type: SSEEventType): void {
  const payload = `data: ${JSON.stringify({ type })}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client.id);
    }
  }
}
