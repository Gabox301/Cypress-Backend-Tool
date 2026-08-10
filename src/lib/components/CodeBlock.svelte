<script lang="ts">
  interface Props {
    data?: unknown;
    format?: string;
  }
  let { data = null, format = 'json' }: Props = $props();
  let copied = $state(false);
  let formattedData = $derived.by(() => {
    if (!data) return '';
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  });
  let lines = $derived(formattedData.split('\n'));
  interface Token {
    text: string;
    class?: string;
  }
  /** Divide una línea JSON en tokens clasificados para un renderizado seguro basado en <span>.
   *  Nunca genera HTML crudo — devuelve tokens estructurados en su lugar. */
  function tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    const re = /("[^"]+")(?=\s*:)|:\s*("[^"]*")|:\s*(\d+\.?\d*)|:\s*(true|false)|:\s*(null)/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIndex) {
        tokens.push({ text: line.slice(lastIndex, m.index) });
      }
      if (m[1] !== undefined) tokens.push({ text: m[1], class: 'json-key' });
      else if (m[2] !== undefined) tokens.push({ text: m[2], class: 'json-string' });
      else if (m[3] !== undefined) tokens.push({ text: m[3], class: 'json-number' });
      else if (m[4] !== undefined) tokens.push({ text: m[4], class: 'json-bool' });
      else if (m[5] !== undefined) tokens.push({ text: m[5], class: 'json-null' });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ text: line.slice(lastIndex) });
    }
    return tokens;
  }
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(formattedData);
    } catch {
      // El portapapeles puede no estar disponible (runner de Cypress, headless, etc.)
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="wrapper" data-testid="code-block">
  {#if data}
    <div class="code-container">
      <div class="code-header">
        <span class="format-badge">{format}</span>
        <button class="copy-btn" class:done={copied} onclick={copyToClipboard}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <div class="code-body">
        <div class="gutter">
          {#each lines as _, i (i)}
            <div class="line-num">{i + 1}</div>
          {/each}
          <div class="gutter-filler"></div>
        </div>
        <div class="code-content">
          {#each lines as line, i (i)}
            <div class="code-line">
              <pre>{#each tokenize(line) as token, j (j)}{#if token.class}<span class={token.class}>{token.text}</span
                    >{:else}{token.text}{/if}{/each}</pre>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    flex: 1;
    min-height: 0;
  }
  .code-container {
    background: #060a10;
    border: 1px solid rgba(0, 212, 255, 0.08);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 12.5px;
    line-height: 1.7;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    background: rgba(0, 212, 255, 0.03);
    border-bottom: 1px solid rgba(0, 212, 255, 0.06);
    flex-shrink: 0;
  }
  .format-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(0, 212, 255, 0.45);
  }
  .copy-btn {
    padding: 2px 10px;
    font-size: 10px;
    font-weight: 600;
    font-family: inherit;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.7);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .copy-btn:hover {
    color: #00d4ff;
    border-color: rgba(0, 212, 255, 0.3);
    background: rgba(0, 212, 255, 0.06);
  }
  .copy-btn.done {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
    background: rgba(74, 222, 128, 0.06);
  }
  .code-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
    display: flex;
  }
  .gutter {
    display: flex;
    flex-direction: column;
    padding: 0 12px 0 8px;
    text-align: right;
    color: rgba(100, 116, 139, 0.3);
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(0, 0, 0, 0.18);
    user-select: none;
    min-width: 40px;
    flex-shrink: 0;
  }
  .gutter-filler {
    flex: 1;
    min-height: 0;
  }
  .code-content {
    flex: 1;
    min-width: 0;
    min-height: 100%;
  }
  .line-num {
    padding: 0;
  }
  .code-line {
    padding: 0 16px;
    overflow-x: visible;
  }
  .code-line pre {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre;
    color: #94a3b8;
  }
  :global(.json-key) {
    color: #7dd3fc;
  }
  :global(.json-string) {
    color: #86efac;
  }
  :global(.json-number) {
    color: #fca5a5;
  }
  :global(.json-bool) {
    color: #c4b5fd;
  }
  :global(.json-null) {
    color: #64748b;
    font-style: italic;
  }
</style>
