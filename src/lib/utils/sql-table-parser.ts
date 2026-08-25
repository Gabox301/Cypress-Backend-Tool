import { dbConnectionsGlobal } from '$lib/stores.svelte';

export function parseDatabase(connectionId: string | undefined): string {
  if (!connectionId) return '—';
  const conn = dbConnectionsGlobal.find((c) => c.id === connectionId);
  return conn?.database ?? '—';
}

export function stripCommentsAndStrings(sql: string): string {
  let result = sql;
  // Elimina comentarios de bloque /* ... */
  result = result.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Elimina comentarios de línea -- hasta fin de línea
  result = result.replace(/--.*$/gm, ' ');
  // Elimina strings entre comillas simples '...' manejando '' escapado
  result = result.replace(/'(?:''|[^'])*'/g, ' ');
  return result;
}

export function removeCTE(sql: string): string {
  const trimmed = sql.trim();
  if (!/^\s*WITH\b/i.test(trimmed)) return sql;
  // Busca el SELECT/INSERT/UPDATE/DELETE principal después de la definición CTE
  // Heurística simple: ubica el último paréntesis de cierre del CTE y luego busca la palabra clave
  // Para MVP, elimina segmentos WITH ... AS (...) de forma iterativa
  let without = sql;
  // Elimina la palabra clave WITH
  without = without.replace(/^\s*WITH\b/i, ' ');
  // Elimina definiciones CTE: nombre AS (...), opcionalmente separadas por coma
  // Itera para manejar múltiples CTEs
  let prev: string;
  do {
    prev = without;
    without = without.replace(/^\s*\S+\s+AS\s*\([^)]*\)\s*,?\s*/i, ' ');
  } while (without !== prev);
  return without;
}

export function normalizeIdentifier(identifier: string): string {
  // Divide por punto y toma la última parte (elimina esquema)
  const parts = identifier.split('.');
  let last = parts[parts.length - 1] ?? identifier;
  // Elimina espacios y caracteres de entrecomillado " ` [ ]
  last = last.trim();
  // Elimina comillas/corchetes del inicio y final de forma iterativa
  // eslint-disable-next-line no-useless-escape
  last = last.replace(/^["`\[]+/, '').replace(/["`\]]+$/, '');
  // También maneja caso donde "users" queda con comillas internas ya eliminadas
  // Elimina cualquier comilla restante al inicio/final
  last = last.replace(/^["`]+|["`]+$/g, '');
  return last;
}

export function extractTables(sql: string): string[] {
  const stripped = stripCommentsAndStrings(sql);
  const withoutCTE = removeCTE(stripped);
  const regex = /(?:FROM|JOIN|INTO|UPDATE)\s+([^\s,;()]+)/gi;
  const seen = new Set<string>();
  const tables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(withoutCTE)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const normalized = normalizeIdentifier(raw);
    if (!normalized) continue;
    // Filtra palabras clave SQL que podrían capturarse incorrectamente
    if (/^(SELECT|WHERE|ON|SET|VALUES)$/i.test(normalized)) continue;
    const lower = normalized.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      tables.push(normalized);
    }
  }
  return tables;
}

export function extractQueryType(sql: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UNKNOWN' {
  const stripped = stripCommentsAndStrings(sql);
  const withoutCTE = removeCTE(stripped).trim();
  const match = withoutCTE.match(/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i);
  if (match && match[1]) {
    return match[1].toUpperCase() as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  }
  return 'UNKNOWN';
}
