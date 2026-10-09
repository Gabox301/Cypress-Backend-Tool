/// <reference types="cypress" />

// The ambient Cypress augmentation runs first: no runtime statements, so the
// static import only orders the module graph — same chunk, no runtime trace.
import './support/cypress-augment';

// ============================================
// Herramienta Backend de Cypress — Entrada unificada
// Auto-inicialización con importación por efecto secundario.
// Reemplaza cypress/support/plugin/index.ts
// ============================================
import { configure } from '$lib/config';
import { registerHttpCommand } from './commands/http';
import { registerQueryCommand } from './commands/query';
import './support/hooks';
import { getOrCreateContainer } from './support/plugin-ui';
import './support/runtime-guards';

// El orden de registro preserva el original: chai → guards → http → query → beforeEach.
// runtime-guards corre el interceptor Chai + guards al importarse; hooks registra beforeEach.
registerHttpCommand();
registerQueryCommand();

// Exportado para pruebas unitarias (se mantiene el nombre antiguo para evitar
// cambios innecesarios en cualquier test existente que lo importe).
export { getOrCreateContainer as createFreshContainer };

// API pública re-exportada
export { configure };
