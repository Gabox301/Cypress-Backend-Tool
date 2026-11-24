<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    children: Snippet;
    id?: string;
    class?: string;
  }
  let { children, id, class: klass }: Props = $props();
  let viewport: HTMLDivElement | undefined = $state(undefined);
  let track: HTMLDivElement | undefined = $state(undefined);
  let thumb: HTMLDivElement | undefined = $state(undefined);
  let thumbHeight = $state(40);
  let thumbTop = $state(0);
  let isDragging = $state(false);
  let isHovering = $state(false);
  let dragStartY = 0;
  let dragStartTop = 0;
  let rafPending = false;
  // Realm del arrastre en curso: los listeners se quitan de la MISMA ventana y
  // el bloqueo de selección se restaura en el MISMO documento donde se puso.
  let dragWindow: Window | null = null;
  let dragDocument: Document | null = null;

  // La UI vive en el document del AUT (iframe), pero el bundle se ejecuta en el
  // contexto del runner: las globales `window`/`document` pueden ser OTRO realm.
  // Todo lo que depende del DOM se resuelve desde el contexto de montaje — el
  // ownerDocument del viewport — igual que la delegación de copy.
  function autDocument(): Document | null {
    if (viewport) return viewport.ownerDocument;
    return typeof document !== 'undefined' ? document : null;
  }
  function autWindow(): Window | null {
    const doc = autDocument();
    if (doc?.defaultView) return doc.defaultView;
    return typeof window !== 'undefined' ? window : null;
  }
  function scheduleUpdateThumb(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updateThumb();
    });
  }
  function updateThumb(): void {
    if (!viewport || !track) return;
    const { clientHeight, scrollHeight, scrollTop } = viewport;
    const trackHeight = track.clientHeight;
    if (trackHeight === 0) return;
    let nextHeight: number;
    let nextTop: number;
    if (scrollHeight <= clientHeight) {
      nextHeight = trackHeight;
      nextTop = 0;
    } else {
      const calculated = (clientHeight * clientHeight) / scrollHeight;
      nextHeight = Math.max(40, Math.min(calculated, trackHeight));
      const maxThumbTop = trackHeight - nextHeight;
      const maxScrollTop = scrollHeight - clientHeight;
      nextTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0;
    }
    if (nextHeight !== thumbHeight) thumbHeight = nextHeight;
    if (nextTop !== thumbTop) thumbTop = nextTop;
  }
  function handleScroll(): void {
    scheduleUpdateThumb();
  }
  function handleThumbMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartY = e.clientY;
    dragStartTop = thumbTop;
    dragDocument = autDocument();
    dragWindow = autWindow();
    if (dragDocument) dragDocument.body.style.userSelect = 'none';
    dragWindow?.addEventListener('mousemove', handleThumbMouseMove);
    dragWindow?.addEventListener('mouseup', handleThumbMouseUp);
  }
  function handleThumbMouseMove(e: MouseEvent): void {
    if (!viewport || !track) return;
    const deltaY = e.clientY - dragStartY;
    const maxThumbTop = track.clientHeight - thumbHeight;
    const newTop = Math.min(Math.max(0, dragStartTop + deltaY), maxThumbTop);
    thumbTop = newTop;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const ratio = maxThumbTop > 0 ? newTop / maxThumbTop : 0;
    viewport.scrollTop = ratio * maxScrollTop;
  }
  function handleThumbMouseUp(): void {
    isDragging = false;
    if (dragDocument) dragDocument.body.style.userSelect = '';
    dragWindow?.removeEventListener('mousemove', handleThumbMouseMove);
    dragWindow?.removeEventListener('mouseup', handleThumbMouseUp);
    dragDocument = null;
    dragWindow = null;
  }
  function handleTrackClick(e: MouseEvent): void {
    if (!viewport || !track) return;
    if (e.target === thumb) return;
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const maxThumbTop = track.clientHeight - thumbHeight;
    const newTop = Math.min(Math.max(0, clickY - thumbHeight / 2), maxThumbTop);
    thumbTop = newTop;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const ratio = maxThumbTop > 0 ? newTop / maxThumbTop : 0;
    viewport.scrollTop = ratio * maxScrollTop;
  }
  $effect(() => {
    if (!viewport || !track) return;
    // Realm de montaje: el observer, el resize y el reseteo de selección viven
    // en el document del AUT, no en las globales del bundle.
    const doc = viewport.ownerDocument;
    const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null);
    const MutationObserverImpl =
      doc.defaultView?.MutationObserver ??
      (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined);
    updateThumb();
    let mo: MutationObserver | undefined;
    if (MutationObserverImpl) {
      mo = new MutationObserverImpl(() => scheduleUpdateThumb());
      mo.observe(viewport, {
        childList: true,
      });
    }
    const onResize = (): void => scheduleUpdateThumb();
    win?.addEventListener('resize', onResize);
    const onWindowError = (e: ErrorEvent) => {
      if (e.message?.includes('ResizeObserver loop') || String(e.error?.message ?? '').includes('ResizeObserver')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    win?.addEventListener('error', onWindowError);
    const onRejection = (e: PromiseRejectionEvent) => {
      if (String(e.reason?.message ?? e.reason).includes('ResizeObserver')) e.preventDefault();
    };
    win?.addEventListener('unhandledrejection', onRejection);
    return () => {
      mo?.disconnect();
      win?.removeEventListener('resize', onResize);
      win?.removeEventListener('error', onWindowError);
      win?.removeEventListener('unhandledrejection', onRejection);
      win?.removeEventListener('mousemove', handleThumbMouseMove);
      win?.removeEventListener('mouseup', handleThumbMouseUp);
      doc.body.style.userSelect = '';
    };
  });
</script>

<div
  class="scroll-root {klass ?? ''}"
  role="presentation"
  onmouseenter={() => (isHovering = true)}
  onmouseleave={() => (isHovering = false)}
>
  <div bind:this={viewport} {id} class="viewport" data-testid="scroll-area-viewport" onscroll={handleScroll}>
    {@render children()}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    class="track"
    class:visible={isHovering || isDragging}
    data-testid="scroll-track"
    onmousedown={handleTrackClick}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={thumb}
      class="thumb"
      class:dragging={isDragging}
      data-testid="scroll-thumb"
      style="height:{thumbHeight}px; transform:translateY({thumbTop}px)"
      onmousedown={handleThumbMouseDown}
    ></div>
  </div>
</div>

<style>
  .scroll-root {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
    overflow: visible;
    background: #1a1a2e;
    container-type: inline-size;
    container-name: cabt-scroll;
  }

  .viewport {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #1a1a2e;
    overscroll-behavior: contain;
    contain: none;
  }

  .viewport::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .track {
    position: absolute;
    top: 4px;
    right: 2px;
    bottom: 4px;
    width: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    opacity: 0;
    transition:
      opacity 0.2s ease,
      width 0.2s ease,
      background 0.2s ease;
    cursor: pointer;
    z-index: 10;
  }

  .track.visible {
    opacity: 1;
  }

  .track:hover {
    width: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .thumb {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
    cursor: grab;
    transition: background 0.2s ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    will-change: transform;
  }

  .thumb:hover {
    background: rgba(0, 212, 255, 0.6);
  }

  .thumb.dragging,
  .thumb:active {
    cursor: grabbing;
    background: rgba(0, 212, 255, 0.7);
  }
</style>
