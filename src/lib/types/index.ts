export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  qs?: Record<string, string>;
  auth?: { username: string; password: string };
  expect?: unknown;
}

export interface ApiRequestOptions extends ApiRequest {
  auth?: { username: string; password: string };
  failOnStatusCode?: boolean;
  gzip?: boolean;
  encoding?: string;
  timeout?: number;
  expect?: unknown;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
  size: number;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: string;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
}

export interface CypressApiPluginConfig {
  snapshotOnly: boolean;
  hideCredentials: boolean;
  hideCredentialsOptions: {
    headers: boolean;
    auth: boolean;
    body: boolean;
    query: boolean;
  };
  requestMode: 'auto' | 'manual';
  CYPRESS_PLUGIN_DEBUG: boolean;
}

export interface DbQueryResult {
  rows: unknown[];
  rowCount: number;
  duration: number;
  fields: Array<{ name: string; dataTypeID: number }>;
}

export interface DbQueryDisplayData {
  query: string;
  rows: unknown[];
  rowCount: number;
  duration: number;
  error?: string;
}

export interface ApiCall {
  id: string;
  request: ApiRequest;
  response: ApiResponse | null;
  expect?: unknown;
  timestamp: number;
  error?: string;
}

export interface DbConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface DbQuery {
  id: string;
  connectionId: string;
  query: string;
  result: unknown[] | null;
  error?: string;
  duration: number;
  timestamp: number;
  database?: string;
}

export interface TabItem {
  id: string;
  type: 'api' | 'db';
  name: string;
  data: ApiCall | DbQuery;
}
