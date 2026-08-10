import js from '@eslint/js';
import sveltePlugin from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default [
  // -----------------------------------------------------------------------
  // Base: patrones de ignorado
  // -----------------------------------------------------------------------
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'cypress-plugin-api-main/**',
      'docs/**',
      '.atl/**',
      '.vscode/**',
      'openspec/**',
      'coverage/**',
      'package-lock.json',
    ],
  },
  // -----------------------------------------------------------------------
  // Conjuntos de reglas recomendados
  // -----------------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...sveltePlugin.configs.recommended,
  // -----------------------------------------------------------------------
  // Opciones de lenguaje globales para todos los archivos
  // -----------------------------------------------------------------------
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // -----------------------------------------------------------------------
  // Archivos fuente de TypeScript
  // -----------------------------------------------------------------------
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-debugger': 'error',
    },
  },
  // -----------------------------------------------------------------------
  // Archivos de configuración — no se necesita proyecto tsconfig
  // -----------------------------------------------------------------------
  {
    files: ['*.config.{ts,js}', 'cypress.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // -----------------------------------------------------------------------
  // Archivos Svelte — sobrescribe el parser de TS con el parser de Svelte
  // -----------------------------------------------------------------------
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'svelte/no-at-html-tags': 'warn',
      'svelte/valid-compile': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
  // -----------------------------------------------------------------------
  // Archivos de tests E2E de Cypress — reglas relajadas
  // -----------------------------------------------------------------------
  {
    files: ['cypress/e2e/**/*.cy.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  // -----------------------------------------------------------------------
  // Archivos de support de Cypress
  // -----------------------------------------------------------------------
  {
    files: ['cypress/support/**/*.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  // -----------------------------------------------------------------------
  // Archivos de tests unitarios — reglas relajadas
  // -----------------------------------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
