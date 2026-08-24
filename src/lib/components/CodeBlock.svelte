<script lang="ts">
  import { copyTextToClipboard, registerLiveCopyButton } from '../ui/copy-delegation';
  import { computeJsonLineStatuses } from '../ui/expect-matcher';

  interface Props {
    data?: unknown;
    expected?: unknown;
    format?: string;
  }

  let { data = null, expected = undefined, format = 'json' }: Props = $props();
  let copied = $state(false);
  let copyFailed = $state(false);

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

  let expectResult = $derived.by(() => {
    if (format !== 'json' || expected === undefined) {
      return { statuses: [], summary: { match: 0, mismatch: 0, nullish: 0 } };
    }
    return computeJsonLineStatuses(formattedData, data, expected);
  });

  let lineStatuses = $derived(expectResult.statuses);
  let expectSummary = $derived(expectResult.summary);
  let hasExpect = $derived(
    expected !== undefined && (expectSummary.match > 0 || expectSummary.mismatch > 0 || expectSummary.nullish > 0),
  );

  interface Token {
    text: string;
    class?: string;
  }

  /** Divide una línea JSON en tokens clasificados para un renderizado seguro basado en <span>.
   *  Nunca genera HTML crudo — devuelve tokens estructurados en su lugar. */
  function tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    // Clave JSON (con escapes válidos), separador ":" y opcionalmente un valor escalar.
    // El separador se captura aparte (m[2]) y se emite como texto plano para no perderlo.
    const re = /("(?:[^"\\]|\\.)*")(\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*"|true|false|null)?/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIndex) {
        tokens.push({ text: line.slice(lastIndex, m.index) });
      }
      tokens.push({ text: m[1], class: 'json-key' });
      tokens.push({ text: m[2] });
      if (m[3] !== undefined) {
        const value = m[3];
        if (value === 'true' || value === 'false') tokens.push({ text: value, class: 'json-bool' });
        else if (value === 'null') tokens.push({ text: value, class: 'json-null' });
        else if (value.startsWith('"')) tokens.push({ text: value, class: 'json-string' });
        else tokens.push({ text: value, class: 'json-number' });
      }
      lastIndex = re.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ text: line.slice(lastIndex) });
    }
    return tokens;
  }

  async function copyToClipboard(event: MouseEvent) {
    // El DOM vivo usa el handler de Svelte. Detener la propagación evita que el
    // listener delegado intente copiar el mismo bloque por segunda vez.
    event.stopPropagation();
    const button = event.currentTarget as HTMLButtonElement;
    const success = await copyTextToClipboard(formattedData, button.ownerDocument);
    copied = success;
    copyFailed = !success;
    setTimeout(() => {
      copied = false;
      copyFailed = false;
    }, 2000);
  }
</script>

<div class="wrapper" data-testid="code-block">
  {#if data}
    <div class="code-container">
      <div class="code-header">
        <div class="header-left">
          <span class="format-badge">{format}</span>
          {#if hasExpect}
            <div class="expect-badges">
              {#if expectSummary.match > 0}
                <span class="expect-pill match" title="Match exacto">✓ {expectSummary.match} match</span>
              {/if}
              {#if expectSummary.mismatch > 0}
                <span class="expect-pill mismatch" title="No coincide">✗ {expectSummary.mismatch} mismatch</span>
              {/if}
              {#if expectSummary.nullish > 0}
                <span class="expect-pill nullish" title="Valor null o undefined"
                  >⚠ {expectSummary.nullish} null/undef</span
                >
              {/if}
            </div>
          {/if}
        </div>
        <button
          class="copy-btn"
          data-copy
          data-copy-text={formattedData}
          class:done={copied}
          class:failed={copyFailed}
          use:registerLiveCopyButton
          onclick={copyToClipboard}
        >
          {copied ? '✓ copied' : copyFailed ? 'copy failed' : 'copy'}
        </button>
      </div>
      <div class="code-body">
        <div class="gutter">
          {#each lines as _, i (i)}
            <div
              class="line-num"
              class:num-match={lineStatuses[i] === 'match'}
              class:num-mismatch={lineStatuses[i] === 'mismatch'}
              class:num-nullish={lineStatuses[i] === 'nullish'}
            >
              {i + 1}
            </div>
          {/each}
          <div class="gutter-filler"></div>
        </div>
        <div class="code-content">
          {#each lines as line, i (i)}
            <div
              class="code-line"
              class:line-match={lineStatuses[i] === 'match'}
              class:line-mismatch={lineStatuses[i] === 'mismatch'}
              class:line-nullish={lineStatuses[i] === 'nullish'}
            >
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
    flex: 0 1 auto;
    height: auto;
    min-height: 0;
    min-width: 0;
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
    flex: 0 1 auto;
    height: auto;
    max-height: min(50dvh, 500px);
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
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
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .format-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(0, 212, 255, 0.45);
  }
  .expect-badges {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .expect-pill {
    display: inline-flex;
    align-items: center;
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    font-family: inherit;
    white-space: nowrap;
  }
  .expect-pill.match {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.12);
    border: 1px solid rgba(74, 222, 128, 0.25);
  }
  .expect-pill.mismatch {
    color: #f87171;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .expect-pill.nullish {
    color: #facc15;
    background: rgba(250, 204, 21, 0.12);
    border: 1px solid rgba(250, 204, 21, 0.25);
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
  .copy-btn.failed {
    color: #fb7185;
    border-color: rgba(251, 113, 133, 0.3);
    background: rgba(251, 113, 133, 0.06);
  }
  .code-body {
    flex: 0 1 auto;
    min-height: 120px;
    min-width: 0;
    max-height: min(45dvh, 400px);
    overflow: auto;
    display: flex;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.35) transparent;
  }
  .code-body::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .code-body::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
  }
  .code-body::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.35);
    border-radius: 3px;
  }
  .code-body::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 212, 255, 0.6);
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
    transition: color 0.15s;
  }
  .line-num.num-match {
    color: #4ade80;
    font-weight: 600;
  }
  .line-num.num-mismatch {
    color: #ef4444;
    font-weight: 600;
  }
  .line-num.num-nullish {
    color: #facc15;
    font-weight: 600;
  }
  .code-line {
    padding: 0 16px;
    overflow-x: visible;
    transition: background 0.15s;
  }
  .code-line.line-match {
    background: rgba(74, 222, 128, 0.08);
    border-left: 3px solid #4ade80;
    padding-left: 13px;
  }
  .code-line.line-match pre {
    color: #86efac;
  }
  .code-line.line-match :global(.json-key) {
    color: #4ade80;
  }
  .code-line.line-match :global(.json-string) {
    color: #86efac;
  }
  .code-line.line-match :global(.json-number),
  .code-line.line-match :global(.json-bool) {
    color: #86efac;
  }
  .code-line.line-mismatch {
    background: rgba(239, 68, 68, 0.12);
    border-left: 3px solid #ef4444;
    padding-left: 13px;
  }
  .code-line.line-mismatch pre {
    color: #fca5a5;
  }
  .code-line.line-mismatch :global(.json-key) {
    color: #f87171;
  }
  .code-line.line-mismatch :global(.json-string),
  .code-line.line-mismatch :global(.json-number),
  .code-line.line-mismatch :global(.json-bool) {
    color: #fca5a5;
  }
  .code-line.line-nullish {
    background: rgba(250, 204, 21, 0.1);
    border-left: 3px solid #facc15;
    padding-left: 13px;
  }
  .code-line.line-nullish pre {
    color: #fef08a;
  }
  .code-line.line-nullish :global(.json-key) {
    color: #facc15;
  }
  .code-line.line-nullish :global(.json-null),
  .code-line.line-nullish :global(.json-string),
  .code-line.line-nullish :global(.json-number) {
    color: #fde047;
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
