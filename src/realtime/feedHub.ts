type Sender = (sseChunk: string) => void;

const byUser = new Map<string, Set<Sender>>();

export function subscribeFeed(userId: string, send: Sender): () => void {
  let set = byUser.get(userId);
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
    if (set!.size === 0) byUser.delete(userId);
  };
}

export function broadcastFeedEvent(userId: string, payload: unknown): void {
  const set = byUser.get(userId);
  if (!set || set.size === 0) return;
  const body = `data: ${JSON.stringify({ type: 'event', payload })}\n\n`;
  for (const send of set) {
    try {
      send(body);
    } catch {}
  }
}
