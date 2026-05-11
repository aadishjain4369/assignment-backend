export function sourceFromBodyOrHeader(
  body: Record<string, unknown>,
  headerSource: string | undefined
): string {
  const fromBody = body.source;
  if (typeof fromBody === 'string') return fromBody.trim();
  if (typeof headerSource === 'string') return headerSource.trim();
  return '';
}

export function ingestKeyFrom(
  body: Record<string, unknown>,
  headerIngestKey: string | undefined
): string {
  const hk = typeof headerIngestKey === 'string' ? headerIngestKey.trim() : undefined;
  if (hk) return hk;
  const k = body.ingestKey;
  if (typeof k === 'string') return k.trim();
  return '';
}

export function eventMeta(body: Record<string, unknown>): {
  eventType: string;
  externalId?: string;
  idempotencyKey?: string;
} {
  const ext = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined;
  const idem =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : undefined;
  return {
    eventType: typeof body.type === 'string' ? body.type : 'unknown',
    externalId: ext,
    idempotencyKey: idem,
  };
}
