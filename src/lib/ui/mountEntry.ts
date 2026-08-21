import { pluginConfig } from '$lib/stores.svelte';
import type { ApiCall, DbQuery } from '$lib/types';
import { mount } from 'svelte';
import EntryPanel from '../components/EntryPanel.svelte';
import { EntryRegistry } from './entry-registry';

/**
 * Monta un EntryPanel independiente en un div#cabt-entry-{id} persistente dentro
 * del contenedor del plugin. La entrada se registra en EntryRegistry (con su
 * payload de datos capturado, de modo que un intercambio posterior de body pueda
 * revivirla) y su DOM sobrevive a la limpieza de stores entre bloques it() de Cypress.
 *
 * Los valores de configuración (hideCredentials, snapshotOnly, etc.) se capturan en
 * el momento del montaje como props del componente — NO son reactivos. Esto coincide
 * con la decisión de diseño: "Config capturada en el montaje, no reactiva."
 *
 * @returns El elemento div#cabt-entry-{id} creado.
 */
export function mountEntry(data: ApiCall | DbQuery, doc: Document = document): HTMLElement {
  const id = data.id;
  const container = doc.getElementById('cypress-api-plugin-container');
  if (!container) {
    throw new Error('mountEntry: plugin container not found — call getOrCreateContainer first');
  }
  // Monta las entradas dentro del scroll-area para que hagan scroll de forma natural
  const scrollArea = container.querySelector('#cabt-scroll-area');
  if (!scrollArea) {
    throw new Error('mountEntry: scroll-area not found — App may not be mounted');
  }
  const div = doc.createElement('div');
  div.id = `cabt-entry-${id}`;
  // Inserta antes del bottom-anchor para que las entradas nuevas aparezcan al final
  const anchor = scrollArea.querySelector('.bottom-anchor');
  if (anchor) {
    scrollArea.insertBefore(div, anchor);
  } else {
    scrollArea.appendChild(div);
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
