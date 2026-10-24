/// <reference types="cypress" />

import { reserveEntry } from "$lib/ui";
import { logDebug } from "./debug";
import { readPluginConfig } from "./plugin-config";
import { applySnapshotOnly, getOrCreateContainer } from "./plugin-ui";

/**
 * Reserva el placeholder `#cabt-entry-{id}` EN ORDEN DE LLAMADA (B3: extraído
 * de `cy.http`/`cy.query`, idéntico en ambos). Debe llamarse antes del
 * transporte para que el orden visual siga al orden de llamada y no al de
 * finalización. Nunca lanza: un fallo de reserva no puede romper el comando.
 */
export function reserveCallPlaceholder(callId: string, debugLabel: string): void {
  try {
    const winEarly = cy.state("window") as Window | undefined;
    const docEarly = winEarly?.document;
    if (docEarly?.getElementById) {
      const containerEarly = getOrCreateContainer(docEarly);
      const cfgEarly = readPluginConfig();
      applySnapshotOnly(containerEarly, cfgEarly);
      reserveEntry(callId, docEarly);
    }
  } catch (e) {
    logDebug(`reserveEntry ${debugLabel} early failed`, e);
  }
}
