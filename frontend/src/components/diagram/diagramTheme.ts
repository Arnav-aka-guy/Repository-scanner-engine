import type { DesignGroupId } from '../../services/systemDesign';

/** Shared colours for the system design canvas and its SVG/PNG export. */
export const GROUP_THEME: Record<DesignGroupId, { fill: string; stroke: string; title: string }> = {
  client: { fill: 'rgba(157, 140, 255, 0.06)', stroke: 'rgba(157, 140, 255, 0.45)', title: '#8FE7FF' },
  backend: { fill: 'rgba(61, 220, 151, 0.05)', stroke: 'rgba(61, 220, 151, 0.40)', title: '#8EF0C4' },
  data: { fill: 'rgba(61, 220, 151, 0.06)', stroke: 'rgba(61, 220, 151, 0.45)', title: '#8EF0C4' },
  external: { fill: 'rgba(157, 140, 255, 0.07)', stroke: 'rgba(157, 140, 255, 0.45)', title: '#C3B8FF' },
};

/** Accent per node kind (left stripe + kind tag). */
export const KIND_ACCENT: Record<string, string> = {
  client: '#9D8CFF',
  ui: '#9D8CFF',
  state: '#9D8CFF',
  api_client: '#9D8CFF',
  shell: '#9D8CFF',
  entry: '#F4F4F5',
  router: '#3DDC97',
  security: '#9D8CFF',
  service: '#3DDC97',
  worker: '#FFB020',
  data_access: '#3DDC97',
  llm_client: '#9D8CFF',
  core: '#9A9AA3',
  module: '#9A9AA3',
  database: '#3DDC97',
  vector_store: '#3DDC97',
  cache: '#3DDC97',
  storage: '#3DDC97',
  queue: '#FFB020',
  llm: '#9D8CFF',
  external: '#9D8CFF',
};

export const KIND_LABEL: Record<string, string> = {
  client: 'client',
  ui: 'ui',
  state: 'state',
  api_client: 'api client',
  shell: 'shell',
  entry: 'entry',
  router: 'routers',
  security: 'security',
  service: 'service',
  worker: 'worker',
  data_access: 'data access',
  llm_client: 'llm client',
  core: 'core',
  module: 'module',
  database: 'database',
  vector_store: 'vectors',
  cache: 'cache',
  storage: 'storage',
  queue: 'queue',
  llm: 'llm api',
  external: 'external',
};

export const EDGE_COLOR: Record<string, string> = {
  network: '#9D8CFF',
  data: '#3DDC97',
  external: '#9D8CFF',
  dependency: '#6B6B75',
};

export const CANVAS_BG = '#000000';
export const NODE_BG = '#0D0D10';
export const NODE_BORDER = '#222228';
export const TEXT_PRIMARY = '#F4F4F5';
export const TEXT_SECONDARY = '#9A9AA3';
