import { setupChaiExpectInterceptor } from '$lib/ui/chai-interceptor';

// Auto-inicializar interceptor de aserciones Chai de Cypress
setupChaiExpectInterceptor();

// Silenciar ResizeObserver loop benigno (Chrome) para que no rompa afterEach en producción
// El fix real está en ScrollArea (sin ResizeObserver, solo MutationObserver childList + rAF), este handler es red de seguridad
if (
  typeof Cypress !== 'undefined' &&
  (Cypress as unknown as { on?: (e: string, h: (err: unknown) => false | void) => void }).on
) {
  (Cypress as unknown as { on: (e: string, h: (err: unknown) => false | void) => void }).on(
    'uncaught:exception',
    (err: unknown) => {
      if (String((err as { message?: unknown })?.message ?? err).includes('ResizeObserver')) return false;
    },
  );
}

try {
  const win = (typeof window !== 'undefined' ? window : undefined) as unknown as Window & typeof globalThis;
  if (win) {
    win.addEventListener('error', (e: ErrorEvent) => {
      if (e.message?.includes('ResizeObserver')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    });
  }
} catch {
  // entorno sin window (Node) — ignora
  void 0;
}
