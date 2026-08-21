export type MatchStatus = 'match' | 'mismatch' | 'nullish' | null;

export interface ExpectSummary {
  match: number;
  mismatch: number;
  nullish: number;
}

export interface ExpectResult {
  statuses: MatchStatus[];
  summary: ExpectSummary;
}

/**
 * Comparación profunda de igualdad entre dos valores.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
    if (!deepEqual(objA[k], objB[k])) return false;
  }

  return true;
}

/**
 * Comprueba si una ruta existe dentro de un objeto/array.
 */
export function hasPath(obj: unknown, path: (string | number)[]): boolean {
  if (obj === null || obj === undefined) return false;
  if (path.length === 0) return true;

  let curr: unknown = obj;
  for (const segment of path) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return false;
    if (!(segment in (curr as Record<string, unknown>))) return false;
    curr = (curr as Record<string, unknown>)[segment as string];
  }
  return true;
}

/**
 * Obtiene el valor en una ruta dentro de un objeto/array.
 */
export function getPath(obj: unknown, path: (string | number)[]): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (path.length === 0) return obj;

  let curr: unknown = obj;
  for (const segment of path) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[segment as string];
  }
  return curr;
}

interface StackItem {
  depth: number;
  key?: string;
  index?: number;
  isArray?: boolean;
}

/**
 * Analiza un JSON formateado línea por línea y evalúa el estado de coincidencia
 * contra el objeto/valor `expected`.
 */
export function computeJsonLineStatuses(formattedData: string, rawData: unknown, expected: unknown): ExpectResult {
  const lines = formattedData.split('\n');
  const statuses: MatchStatus[] = new Array(lines.length).fill(null);
  const summary: ExpectSummary = { match: 0, mismatch: 0, nullish: 0 };

  if (expected === undefined || expected === '') {
    return { statuses, summary };
  }

  // Si data es un valor escalar directo (una sola línea)
  // Amarillo solo si el valor REAL es null/undefined (no por expected)
  if (lines.length === 1 && (typeof rawData !== 'object' || rawData === null)) {
    if (rawData === null || rawData === undefined) {
      statuses[0] = 'nullish';
      summary.nullish++;
    } else if (deepEqual(rawData, expected)) {
      statuses[0] = 'match';
      summary.match++;
    } else {
      statuses[0] = 'mismatch';
      summary.mismatch++;
    }
    return { statuses, summary };
  }

  const stack: StackItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '[') {
      if (trimmed === '{') {
        stack.push({ depth: 0, isArray: false });
      } else if (trimmed === '[') {
        stack.push({ depth: 0, isArray: true, index: 0 });
      }
      continue;
    }

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const depth = Math.floor(indent / 2);

    // Ajustar stack al nivel de profundidad actual
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      const popped = stack.pop();
      // Si cerramos un elemento dentro de un array contenedor, incrementar el índice del array
      if (stack.length > 0 && stack[stack.length - 1].isArray && popped && !popped.isArray) {
        if (stack[stack.length - 1].index !== undefined) {
          stack[stack.length - 1].index!++;
        }
      }
    }

    // Líneas de cierre
    if (trimmed === '}' || trimmed === '},' || trimmed === ']' || trimmed === '],') {
      continue;
    }

    // Comprobar si es clave de objeto: "key": value
    const keyMatch = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const rest = keyMatch[2].trim();

      const currentPath: (string | number)[] = [];
      for (const item of stack) {
        if (item.key !== undefined) currentPath.push(item.key);
        else if (item.index !== undefined) currentPath.push(item.index);
      }
      currentPath.push(key);

      if (rest.startsWith('{')) {
        stack.push({ depth, key, isArray: false });
        if (hasPath(expected, currentPath)) {
          const actVal = getPath(rawData, currentPath);
          if (actVal === null || actVal === undefined) {
            statuses[i] = 'nullish';
            summary.nullish++;
          } else {
            const expVal = getPath(expected, currentPath);
            if (expVal !== null && expVal !== undefined && typeof expVal !== 'object') {
              statuses[i] = 'mismatch';
              summary.mismatch++;
            }
          }
        }
      } else if (rest.startsWith('[')) {
        stack.push({ depth, key, isArray: true, index: 0 });
        if (hasPath(expected, currentPath)) {
          const actVal = getPath(rawData, currentPath);
          if (actVal === null || actVal === undefined) {
            statuses[i] = 'nullish';
            summary.nullish++;
          } else {
            const expVal = getPath(expected, currentPath);
            if (expVal !== null && expVal !== undefined && !Array.isArray(expVal)) {
              statuses[i] = 'mismatch';
              summary.mismatch++;
            }
          }
        }
      } else {
        // Valor escalar — amarillo solo si el valor REAL es null/undefined
        if (hasPath(expected, currentPath)) {
          const expVal = getPath(expected, currentPath);
          const actVal = getPath(rawData, currentPath);

          if (actVal === null || actVal === undefined) {
            statuses[i] = 'nullish';
            summary.nullish++;
          } else if (deepEqual(actVal, expVal)) {
            statuses[i] = 'match';
            summary.match++;
          } else {
            statuses[i] = 'mismatch';
            summary.mismatch++;
          }
        }
      }
      continue;
    }

    // Elementos de array escalar (sin clave): e.g. "valor", 123, true
    if (stack.length > 0 && stack[stack.length - 1].isArray) {
      const arrItem = stack[stack.length - 1];
      const currentIndex = arrItem.index ?? 0;

      const currentPath: (string | number)[] = [];
      for (const item of stack) {
        if (item.key !== undefined) currentPath.push(item.key);
        else if (item.index !== undefined && item !== arrItem) currentPath.push(item.index);
      }
      currentPath.push(currentIndex);

      if (trimmed.startsWith('{')) {
        stack.push({ depth, isArray: false, index: currentIndex });
      } else if (trimmed.startsWith('[')) {
        stack.push({ depth, isArray: true, index: 0 });
      } else {
        // Elemento escalar en array — amarillo solo si valor REAL es null/undefined
        if (hasPath(expected, currentPath)) {
          const expVal = getPath(expected, currentPath);
          const actVal = getPath(rawData, currentPath);

          if (actVal === null || actVal === undefined) {
            statuses[i] = 'nullish';
            summary.nullish++;
          } else if (deepEqual(actVal, expVal)) {
            statuses[i] = 'match';
            summary.match++;
          } else {
            statuses[i] = 'mismatch';
            summary.mismatch++;
          }
        }
        arrItem.index = currentIndex + 1;
      }
    }
  }

  return { statuses, summary };
}
