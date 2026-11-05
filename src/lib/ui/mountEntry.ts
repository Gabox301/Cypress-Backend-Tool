import { pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { mount } from 'svelte';
import EntryPanel from '../components/EntryPanel.svelte';
import { EntryRegistry } from './entry-registry';

/**
 * Reserva un div placeholder vacío #cabt-entry-{id} en orden de llamada, antes de
 * que la request/task resuelva. Esto garantiza orden visual = orden de llamada,
 * no orden de finalización (ej: query local rápida vs http remoto lento).
 * Si el div ya existe es no-op (idempotente).
 * Debe llamarse DESPUÉS de getOrCreateContainer para que scroll-area exista.
 */
export function reserveEntry(id: string, doc: Document = document): HTMLElement {
  const existing = doc.getElementById(`cabt-entry-${id}`) as HTMLElement | null;
  if (existing) return existing;
  const container = doc.getElementById('cypress-api-plugin-container');
  if (!container) {
    throw new Error('reserveEntry: plugin container not found — call getOrCreateContainer first');
  }
  const scrollArea = container.querySelector('#cabt-scroll-area');
  if (!scrollArea) {
    throw new Error('reserveEntry: scroll-area not found — App may not be mounted');
  }
  const div = doc.createElement('div');
  div.id = `cabt-entry-${id}`;
  const anchor = scrollArea.querySelector('.bottom-anchor');
  if (anchor) {
    scrollArea.insertBefore(div, anchor);
  } else {
    scrollArea.appendChild(div);
  }
  return div;
}

/**
 * Monta un EntryPanel independiente en un div#cabt-entry-{id} persistente dentro
 * del contenedor del plugin. La entrada se registra en EntryRegistry (con su
 * payload de datos capturado, de modo que un intercambio posterior de body pueda
 * revivirla) y su DOM sobrevive a la limpieza de stores entre bloques it() de Cypress.
 *
 * Si existe un placeholder reservado por reserveEntry(id), lo REUSA en su posición
 * existente (preservando orden de llamada). Si ya existe un montaje previo para
 * el mismo id, desmonta el componente anterior sin eliminar el div para preservar
 * la posición en el orden.
 *
 * Los valores de configuración (hideCredentials, snapshotOnly, etc.) se capturan en
 * el momento del montaje como props del componente — NO son reactivos. Esto coincide
 * con la decisión de diseño: "Config capturada en el montaje, no reactiva."
 *
 * @returns El elemento div#cabt-entry-{id} usado.
 */
export function mountEntry(data: ApiCall | DbQuery, doc: Document = document): HTMLElement {
  const id = data.id;
  const container = doc.getElementById('cypress-api-plugin-container');
  if (!container) {
    throw new Error('mountEntry: plugin container not found — call getOrCreateContainer first');
  }
  const scrollArea = container.querySelector('#cabt-scroll-area');
  if (!scrollArea) {
    throw new Error('mountEntry: scroll-area not found — App may not be mounted');
  }
  let div = doc.getElementById(`cabt-entry-${id}`) as HTMLElement | null;
  if (div) {
    // Reuso de placeholder o re-mount: si ya existe registro para este id,
    // desmonta el componente previo sin eliminar el div (preserva posición).
    const existingRecord = EntryRegistry.get(id);
    if (existingRecord) {
      EntryRegistry.detach(id);
      // detach ya vació el div y borró el registro, pero el div sigue en DOM
      // tras detach el div reference sigue válido; asegura que sigue conectado
      if (!div.isConnected) {
        // En caso de que detach lógica cambie, re-adquiere
        div = doc.getElementById(`cabt-entry-${id}`) as HTMLElement | null;
        if (!div) {
          div = doc.createElement('div');
          div.id = `cabt-entry-${id}`;
          const anchor = scrollArea.querySelector('.bottom-anchor');
          if (anchor) scrollArea.insertBefore(div, anchor);
          else scrollArea.appendChild(div);
        }
      }
      div.innerHTML = '';
    } else {
      // Placeholder existente sin registro — simplemente vacía por si tenía contenido residual
      div.innerHTML = '';
    }
  } else {
    div = doc.createElement('div');
    div.id = `cabt-entry-${id}`;
    const anchor = scrollArea.querySelector('.bottom-anchor');
    if (anchor) {
      scrollArea.insertBefore(div, anchor);
    } else {
      scrollArea.appendChild(div);
    }
  }
  // Monta el componente de la entrada con las props congeladas en el momento de la llamada.
  const component = mount(EntryPanel, {
    target: div,
    props: {
      data,
      hideCredentials: pluginConfig.hideCredentials,
      hideCredentialsOptions: pluginConfig.hideCredentialsOptions,
      snapshotOnly: pluginConfig.snapshotOnly,
    },
  });
  // Registra la entrada (con su payload de datos) para poder desmontarla luego o
  // revivirla en un contenedor nuevo después de un intercambio de body.
  EntryRegistry.register(id, component, div, data);
  return div;
}
