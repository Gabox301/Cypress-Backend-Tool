import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { ensureCopyDelegation } from '../ui/copy-delegation';
import CodeBlock from './CodeBlock.svelte';

// ---------------------------------------------------------------------------
// Coloreado de JSON
// ---------------------------------------------------------------------------
describe('CodeBlock — coloreado JSON', () => {
  it('renderiza claves JSON con la clase json-key', () => {
    render(CodeBlock, { props: { data: { name: 'Alice', age: 30 }, format: 'json' } });
    const keySpan = document.querySelector('.json-key');
    expect(keySpan).not.toBeNull();
    // El texto de la clave debería aparecer en algún lugar del documento
    expect(screen.getByText(/"name"/)).toBeInTheDocument();
  });

  it('preserva el separador de dos puntos entre clave y valor', () => {
    render(CodeBlock, { props: { data: { title: 'Test Post', body: 'This is a test', userId: 1 }, format: 'json' } });
    // El contenido completo debe incluir ": " después de cada clave
    expect(document.querySelector('.code-content')!.textContent).toContain('"title": "Test Post"');
    expect(document.querySelector('.code-content')!.textContent).toContain('"body": "This is a test"');
    expect(document.querySelector('.code-content')!.textContent).toContain('"userId": 1');
  });

  it('renderiza valores de cadena JSON con la clase json-string', () => {
    render(CodeBlock, { props: { data: { city: 'NYC' }, format: 'json' } });
    const stringSpan = document.querySelector('.json-string');
    expect(stringSpan).not.toBeNull();
  });

  it('renderiza valores numéricos JSON con la clase json-number', () => {
    render(CodeBlock, { props: { data: { count: 42 }, format: 'json' } });
    const numberSpan = document.querySelector('.json-number');
    expect(numberSpan).not.toBeNull();
  });

  it('renderiza valores booleanos JSON con la clase json-bool', () => {
    render(CodeBlock, { props: { data: { active: true, disabled: false }, format: 'json' } });
    const boolSpan = document.querySelector('.json-bool');
    expect(boolSpan).not.toBeNull();
  });

  it('renderiza valores nulos JSON con la clase json-null', () => {
    render(CodeBlock, { props: { data: { deleted: null }, format: 'json' } });
    const nullSpan = document.querySelector('.json-null');
    expect(nullSpan).not.toBeNull();
  });

  it('muestra datos de texto plano tal cual', () => {
    render(CodeBlock, { props: { data: 'Hello, World!', format: 'text' } });
    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
  });

  it('no renderiza nada cuando los datos son nulos', () => {
    const { container } = render(CodeBlock, { props: { data: null, format: 'json' } });
    // El contenedor code-block debería existir pero estar vacío (sin code-body renderizado)
    const block = container.querySelector('[data-testid="code-block"]');
    expect(block).not.toBeNull();
    const codeBody = block!.querySelector('.code-body');
    expect(codeBody).toBeNull();
  });

  it('renderiza JSON multilínea con números de línea correctos', () => {
    render(CodeBlock, { props: { data: { a: 1, b: 2 }, format: 'json' } });
    const lineNums = document.querySelectorAll('.line-num');
    expect(lineNums.length).toBeGreaterThanOrEqual(4);
  });

  it('maneja referencias circulares usando String() como respaldo', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    (obj as any).self = obj;
    render(CodeBlock, { props: { data: obj, format: 'json' } });
    // Debería renderizar sin lanzar errores — el bloque catch convierte a String(obj)
    const codeBlock = document.querySelector('[data-testid="code-block"]');
    expect(codeBlock).not.toBeNull();
  });

  it('copia los datos formateados al portapapeles al hacer clic en el botón', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    render(CodeBlock, { props: { data: { key: 'value' }, format: 'json' } });
    const copyBtn = screen.getByText('copy');
    await fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('{\n  "key": "value"\n}');
  });

  it('copia desde un clon del DOM como un snapshot de Cypress (sin listeners activos)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    render(CodeBlock, { props: { data: { key: 'value' }, format: 'json' } });
    // Cypress restaura los snapshots clonando el HTML del AUT sin listeners,
    // y el listener delegado vive en el document del AUT.
    const autDoc = document.implementation.createHTMLDocument('aut');
    const original = document.querySelector('.code-container');
    expect(original).not.toBeNull();
    const clone = original!.cloneNode(true) as HTMLElement;
    autDoc.body.appendChild(clone);
    ensureCopyDelegation(autDoc);
    try {
      const clonedBtn = clone.querySelector<HTMLButtonElement>('[data-copy]');
      expect(clonedBtn).not.toBeNull();
      // El clon no tiene handler propio; la delegación en el document del AUT
      // (autDoc) debe capturarlo. Se usa dispatchEvent porque fireEvent de
      // testing-library exige nodos del window del test (el clon vive en autDoc).
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      clonedBtn!.dispatchEvent(click);
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith('{\n  "key": "value"\n}');
    } finally {
      clone.remove();
      // Restaurar el listener en el document de trabajo (los tests siguientes
      // dependen del registro en el document global, no en el autDoc).
      ensureCopyDelegation(document);
    }
  });

  it('resalta líneas coincidentes, no coincidentes y nulas cuando se proporciona expected', () => {
    const data = {
      name: 'Leanne Graham',
      username: 'Bret',
      email: null,
      id: 1,
    };
    const expected = {
      name: 'Leanne Graham',
      username: 'WrongName',
      email: 'test@example.com',
    };

    render(CodeBlock, { props: { data, expected, format: 'json' } });

    const matchLines = document.querySelectorAll('.line-match');
    const mismatchLines = document.querySelectorAll('.line-mismatch');
    const nullishLines = document.querySelectorAll('.line-nullish');

    expect(matchLines.length).toBe(1);
    expect(matchLines[0].textContent).toContain('"name": "Leanne Graham"');

    expect(mismatchLines.length).toBe(1);
    expect(mismatchLines[0].textContent).toContain('"username": "Bret"');

    expect(nullishLines.length).toBe(1);
    expect(nullishLines[0].textContent).toContain('"email": null');

    // Insignias en la cabecera
    expect(screen.getByText('✓ 1 match')).toBeInTheDocument();
    expect(screen.getByText('✗ 1 mismatch')).toBeInTheDocument();
    expect(screen.getByText('⚠ 1 null/undef')).toBeInTheDocument();
  });
});
