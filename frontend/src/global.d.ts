interface Window {
  electronAPI?: {
    selectDirectory: () => Promise<string | null>;
    getAppInfo: () => Promise<{ version: string; platform: string }>;
  };
}

declare module 'react-cytoscapejs';
declare module 'cytoscape-dagre';

