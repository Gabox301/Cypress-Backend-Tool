<script lang="ts">
  interface Props {
    name:
      | 'braces'
      | 'search'
      | 'list'
      | 'key'
      | 'terminal'
      | 'zap'
      | 'clock'
      | 'download'
      | 'cookie'
      | 'wifi'
      | 'alert-circle'
      | 'database';
    size?: number;
    color?: string;
  }
  let { name, size = 24, color = 'currentColor' }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === 'braces'}
    <path d="M16 3h5v5M8 3H3v5M16 21h5v-5M8 21H3v-5M14 10l4-4M6 14l-4 4M14 14l4 4M6 10l-4-4" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.34-4.34" />
  {:else if name === 'list'}
    <path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />
  {:else if name === 'key'}
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0 1.41 1.41" />
    <circle cx="7.5" cy="15.5" r="5.5" />
  {:else if name === 'terminal'}
    <path d="M4 17l6-6-6-6M12 19h8" />
  {:else if name === 'zap'}
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  {:else if name === 'cookie'}
    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
    <path d="M8.5 8.5v.01M16 15.5v.01M12 12v.01M11 17v.01M7 14v.01" />
  {:else if name === 'wifi'}
    <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
  {:else if name === 'alert-circle'}
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  {:else if name === 'database'}
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  {/if}
</svg>
