/**
 * IDs y métricas de llamadas (PH3-T3): UUID con fallback para contextos sin
 * `crypto.randomUUID` (http inseguro), duración monotónica y tamaño en bytes
 * UTF-8 reales (no unidades UTF-16 de `string.length`).
 */
export function newCallId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Permiso denegado u otro fallo: cae a los fallbacks de abajo.
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `cabt-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/** Reloj monotónico para duraciones (el `timestamp` visible sigue siendo `Date.now()`). */
export function nowMs(): number {
  return performance.now();
}

/**
 * Tamaño en bytes UTF-8 del body (strings crudos, objetos vía JSON).
 * Circular o inserializable → 0 en vez de romper (el llamador conserva el
 * guard `body ? … : 0` para cuerpos falsy, igual que antes).
 */
export function bodySizeBytes(body: unknown): number {
  try {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new TextEncoder().encode(text ?? "").length;
  } catch {
    return 0;
  }
}
