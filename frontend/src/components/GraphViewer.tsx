import React, { useRef, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Register dagre layout extension — safe to call multiple times
try {
  cytoscape.use(dagre);
} catch {
  // already registered
}

interface GraphViewerProps {
  elements: any;
  layoutName?: 'dagre' | 'cose' | 'breadthfirst' | 'circle';
  onSelectNode: (node: any) => void;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
  elements,
  layoutName = 'cose',
  onSelectNode,
}) => {
  const cyRef = useRef<cytoscape.Core | null>(null);

  const layout: any = {
    name: layoutName,
    rankDir: 'TB',
    nodeSep: 60,
    rankSep: 100,
    animate: true,
    animationDuration: 600,
    animationEasing: 'ease-out-expo' as any,
    fit: true,
    padding: 40,
  };

  const stylesheet: any[] = [
    // ── Base Node ──
    {
      selector: 'node',
      style: {
        'background-color': '#22223a',
        'border-width': 2,
        'border-color': '#60a5fa',
        'label': 'data(label)',
        'color': '#f0f2f5',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'font-family': '"JetBrains Mono", monospace',
        'font-weight': 'bold' as any,
        'width': 70,
        'height': 45,
        'shape': 'round-rectangle',
        'text-wrap': 'wrap' as any,
        'text-max-width': '65px' as any,
        'transition-property': 'background-color, border-color, border-width, width, height',
        'transition-duration': 250,
      } as any,
    },
    // ── Node Types ──
    {
      selector: 'node[node_type="file"]',
      style: {
        'background-color': '#0f0f1a',
        'border-color': '#60a5fa', // blue
        'shape': 'round-rectangle',
      } as any,
    },
    {
      selector: 'node[node_type="class"]',
      style: {
        'background-color': '#0f0f1a',
        'border-color': '#a78bfa', // purple
        'shape': 'ellipse',
      } as any,
    },
    {
      selector: 'node[node_type="function"]',
      style: {
        'background-color': '#0f0f1a',
        'border-color': '#34d399', // green
        'shape': 'round-hexagon',
      } as any,
    },
    {
      selector: 'node[node_type="method"]',
      style: {
        'background-color': '#0f0f1a',
        'border-color': '#fbbf24', // yellow
        'shape': 'round-diamond',
      } as any,
    },
    // ── Base Edge ──
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': 'rgba(96, 165, 250, 0.25)',
        'target-arrow-color': 'rgba(96, 165, 250, 0.4)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'control-point-step-size': 40,
        'target-endpoint': 'outside-to-line' as any,
        'transition-property': 'line-color, width, target-arrow-color',
        'transition-duration': 250,
      } as any,
    },
    // ── Edge Types ──
    {
      selector: 'edge[edge_type="imports"]',
      style: {
        'line-color': 'rgba(96, 165, 250, 0.35)',
        'target-arrow-color': 'rgba(96, 165, 250, 0.55)',
      } as any,
    },
    {
      selector: 'edge[edge_type="calls"]',
      style: {
        'line-color': 'rgba(52, 211, 153, 0.35)',
        'target-arrow-color': 'rgba(52, 211, 153, 0.55)',
      } as any,
    },
    {
      selector: 'edge[edge_type="inherits"]',
      style: {
        'line-color': 'rgba(167, 139, 250, 0.35)',
        'target-arrow-color': 'rgba(167, 139, 250, 0.55)',
      } as any,
    },
    {
      selector: 'edge[edge_type="contains"]',
      style: {
        'line-color': 'rgba(90, 101, 119, 0.25)',
        'target-arrow-color': 'rgba(90, 101, 119, 0.35)',
      } as any,
    },
    // ── Highlighted ──
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 4,
        'width': 80,
        'height': 52,
        'font-size': '11px' as any,
        'z-index': 9999,
        'background-color': '#1a1a2e',
      } as any,
    },
    {
      selector: 'node.dimmed',
      style: {
        'opacity': 0.15,
      } as any,
    },
    {
      selector: 'edge.highlighted',
      style: {
        'width': 3,
        'line-color': '#fb7185',
        'target-arrow-color': '#fb7185',
        'z-index': 9999,
      } as any,
    },
    {
      selector: 'edge.dimmed',
      style: {
        'opacity': 0.08,
      } as any,
    },
    // ── Hover ──
    {
      selector: 'edge:active',
      style: {
        'width': 2.5,
        'line-color': 'rgba(96, 165, 250, 0.6)',
        'target-arrow-color': 'rgba(96, 165, 250, 0.8)',
      } as any,
    },
  ];

  const handleCyReady = useCallback(
    (cy: cytoscape.Core) => {
      cyRef.current = cy;
    },
    []
  );

  // Set up interactive events
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const handleCanvasTap = (evt: cytoscape.EventObject) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted').removeClass('dimmed');
      }
    };

    const handleNodeTap = (evt: cytoscape.EventObject) => {
      const node = evt.target;
      const data = node.data();

      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();

      cy.elements().addClass('dimmed').removeClass('highlighted');
      node.removeClass('dimmed').addClass('highlighted');
      connectedNodes.removeClass('dimmed').addClass('highlighted');
      connectedEdges.removeClass('dimmed').addClass('highlighted');

      onSelectNode(data);
    };

    cy.on('tap', handleCanvasTap);
    cy.on('tap', 'node', handleNodeTap);

    return () => {
      cy.off('tap', handleCanvasTap);
      cy.off('tap', 'node', handleNodeTap);
    };
  }, [elements, onSelectNode]);

  // Re-layout on element changes
  useEffect(() => {
    const cy = cyRef.current;
    if (cy && elements) {
      setTimeout(() => {
        cy.layout(layout).run();
        cy.fit(undefined, 40);
      }, 50);
    }
  }, [elements, layoutName]);

  return (
    <div
      className="w-full h-full relative rounded-xl overflow-hidden"
      style={{ backgroundColor: 'transparent' }}
    >
      <CytoscapeComponent
        elements={CytoscapeComponent.normalizeElements(
          Array.isArray(elements) ? elements : elements?.elements || []
        )}
        layout={layout}
        stylesheet={stylesheet}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
        cy={(cy: cytoscape.Core) => handleCyReady(cy)}
      />
    </div>
  );
};
