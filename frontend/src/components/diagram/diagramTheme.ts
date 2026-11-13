import type { DesignGroupId } from '../../services/systemDesign';

/** Shared colours for the system design canvas and its SVG/PNG export. */
export const GROUP_THEME: Record<DesignGroupId, { fill: string; stroke: string; title: string }> = {
  client: { fill: 'rgba(91, 141, 239, 0.06)', stroke: 'rgba(91, 141, 239, 0.45)', title: '#8FB0F5' },
  backend: { fill: 'rgba(76, 175, 121, 0.05)', stroke: 'rgba(76, 175, 121, 0.40)', title: '#7FCB9F' },
  data: { fill: 'rgba(124, 196, 201, 0.06)', stroke: 'rgba(124, 196, 201, 0.45)', title: '#9AD3D7' },
  external: { fill: 'rgba(149, 128, 202, 0.07)', stroke: 'rgba(149, 128, 202, 0.45)', title: '#B5A4E0' },
};

/** Accent per node kind (left stripe + kind tag). */
export const KIND_ACCENT: Record<string, string> = {
  client: '#5B8DEF',
  ui: '#5B8DEF',
  state: '#5B8DEF',
  api_client: '#5B8DEF',
  shell: '#5B8DEF',
  entry: '#E6EAF0',
  router: '#4CAF79',
  security: '#7B6CF6',
  service: '#4CAF79',
  worker: '#C9943A',
  data_access: '#7CC4C9',
  llm_client: '#9580CA',
  core: '#8A928B',
  module: '#8A928B',
  database: '#7CC4C9',
  vector_store: '#7CC4C9',
  cache: '#7CC4C9',
  storage: '#7CC4C9',
  queue: '#C9943A',
  llm: '#9580CA',
  external: '#9580CA',
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
  network: '#5B8DEF',
  data: '#7CC4C9',
  external: '#9580CA',
  dependency: '#6F7887',
};

export const CANVAS_BG = '#0F1115';
export const NODE_BG = '#171B22';
export const NODE_BORDER = '#2C333D';
export const TEXT_PRIMARY = '#E6EAF0';
export const TEXT_SECONDARY = '#8A928B';
