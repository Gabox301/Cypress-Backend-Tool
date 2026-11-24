import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ApiCall } from "$lib/types";
import { ensurePluginMounted, mountEntry, teardownPluginUI } from "./index";
import { EntryRegistry } from "./entry-registry";

// T7: si el contenedor del plugin se elimina y se crea uno nuevo en el MISMO
// documento (restore de snapshot de Cypress), el shell de la App debe montarse
// en el contenedor nuevo. Sin esto, mountEntry lanza 'scroll-area not found'
// y un cy.http exitoso (200) muere con error del plugin.
function freshContainer(doc: Document = document): HTMLElement {
  const c = doc.createElement("div");
  c.id = "cypress-api-plugin-container";
  doc.body.appendChild(c);
  return c;
}

/** Espera la entrega de los MutationObserver (microtareas) tras una mutación DOM. */
function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  return promise;
}

function apiCall(id: string): ApiCall {
  return {
    id,
    request: { url: "https://example.com/api", method: "GET" },
    response: {
      status: 200,
      statusText: "OK",
      headers: {},
      body: { ok: true },
      duration: 10,
      size: 50,
    },
    timestamp: Date.now(),
  } as ApiCall;
}

/**
 * Simula `restoreDom` de Cypress: reemplaza TODO el body del AUT. `withContainer`
 * decide si el body de reemplazo conserva un clon del contenedor del plugin
 * (restauración de un snapshot con paneles) o no (página limpiada).
 */
function swapBody(withContainer: HTMLElement | null): HTMLElement {
  const newBody = document.createElement("body");
  if (withContainer) newBody.appendChild(withContainer.cloneNode(true));
  document.documentElement.replaceChild(newBody, document.body);
  return newBody;
}

describe("ensurePluginMounted — reemplazo de contenedor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    EntryRegistry.clear();
    teardownPluginUI();
  });

  afterEach(() => {
    teardownPluginUI();
    document.body.innerHTML = "";
    EntryRegistry.clear();
  });

  it("monta el shell en el contenedor nuevo cuando el anterior fue eliminado", () => {
    const c1 = freshContainer();
    ensurePluginMounted(c1, document);
    expect(c1.querySelector("#cabt-scroll-area")).not.toBeNull();

    // Cypress restaura un snapshot: el contenedor viejo desaparece y se crea
    // otro en el mismo documento antes de que corra el observer.
    c1.remove();
    const c2 = freshContainer();
    ensurePluginMounted(c2, document);

    expect(c2.querySelector("#cabt-scroll-area")).not.toBeNull();
  });
});

// #3: resetMountState() anulaba la instancia SIN desmontarla. Si el body de
// reemplazo preserva el contenedor (ruta reviveOrReArm), la siguiente llamada
// volvía a montar App dentro de un contenedor que YA tenía el DOM de App,
// duplicando #cabt-scroll-area y todos los ids internos.
describe("#3 — body de reemplazo que preserva el contenedor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    EntryRegistry.clear();
    teardownPluginUI();
  });

  afterEach(() => {
    teardownPluginUI();
    document.body.innerHTML = "";
    EntryRegistry.clear();
  });

  it("no monta una segunda App cuando el body de reemplazo conserva el contenedor", async () => {
    const c1 = freshContainer();
    ensurePluginMounted(c1, document);
    expect(document.querySelectorAll("#cabt-scroll-area")).toHaveLength(1);

    swapBody(c1);
    await flush();

    // La siguiente llamada del plugin reutiliza el contenedor clonado.
    const replacement = document.getElementById("cypress-api-plugin-container") as HTMLElement;
    ensurePluginMounted(replacement, document);

    expect(document.querySelectorAll("#cabt-scroll-area")).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="scroll-track"]')).toHaveLength(1);
    expect(document.querySelectorAll(".bottom-anchor")).toHaveLength(1);
    // El contenedor huérfano (body viejo) sí se descarta: la instancia vieja se
    // desmonta en el reset en vez de quedar viva apuntando a DOM desconectado.
    expect(c1.childElementCount).toBe(0);
  });

  it("sigue montando el shell cuando el body de reemplazo NO trae el contenedor (revive)", async () => {
    const c1 = freshContainer();
    ensurePluginMounted(c1, document);
    const call = apiCall("revive-1");
    mountEntry(call, document);

    swapBody(null);
    await flush();

    const container = document.getElementById("cypress-api-plugin-container");
    expect(container).not.toBeNull();
    expect(container!.querySelector("#cabt-scroll-area")).not.toBeNull();
    expect(document.querySelectorAll("#cabt-scroll-area")).toHaveLength(1);
    expect(document.getElementById("cabt-entry-revive-1")).not.toBeNull();
  });
});
