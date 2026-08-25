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
    if (scrollHeight <= clientHeight) {
      thumbHeight = trackHeight;
      thumbTop = 0;
      return;
    }
    const calculated = (clientHeight * clientHeight) / scrollHeight;
    thumbHeight = Math.max(40, Math.min(calculated, trackHeight));
    const maxThumbTop = trackHeight - thumbHeight;
    const maxScrollTop = scrollHeight - clientHeight;
    thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0;
  }

  function handleScroll(): void {
    updateThumb();
  }

  function handleThumbMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartY = e.clientY;
    dragStartTop = thumbTop;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleThumbMouseMove);
    window.addEventListener('mouseup', handleThumbMouseUp);
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
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleThumbMouseMove);
    window.removeEventListener('mouseup', handleThumbMouseUp);
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

    updateThumb();

    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scheduleUpdateThumb());
      ro.observe(viewport);
      if (track) ro.observe(track);
    }

    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => scheduleUpdateThumb());
      mo.observe(viewport, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }

    const onResize = (): void => updateThumb();
    window.addEventListener('resize', onResize);

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', handleThumbMouseMove);
      window.removeEventListener('mouseup', handleThumbMouseUp);
      document.body.style.userSelect = '';
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
