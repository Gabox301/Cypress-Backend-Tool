import '@testing-library/jest-dom/vitest';

// Hace requestAnimationFrame síncrono en jsdom para que los tests de ScrollArea
// que usan scheduleUpdateThumb (debounce por rAF) sean deterministas.
// En producción el navegador sigue siendo asíncrono; aquí evitamos flakiness
// y la necesidad de esperar un frame extra tras cada scroll/mutation/resize.
if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
  const raf = (cb: FrameRequestCallback): number => {
    cb(performance.now());
    return 0;
  };
  window.requestAnimationFrame = raf as typeof window.requestAnimationFrame;
  globalThis.requestAnimationFrame = raf as typeof globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = () => {};
  globalThis.cancelAnimationFrame = () => {};
}
