import React, { useState } from 'react';
import { colors, radius, font } from '../../design-system/tokens';
import { Badge } from '../../design-system/primitives';

export interface HotspotItem {
  file_path: string;
  loc: number;
  complexity: number;
  fan_in: number;
  score_effect?: number;
}

interface TreemapHotspotsProps {
  items: HotspotItem[];
  repoPath: string;
  onOpenFile: (path: string) => void;
}

function getRelativePath(fullPath: string, rootPath: string): string {
  if (!fullPath) return '';
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normFile = fullPath.replace(/\\/g, '/');
  if (normRoot && normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\/+/, '');
  }
  return normFile;
}

export const TreemapHotspots: React.FC<TreemapHotspotsProps> = ({
  items,
  repoPath,
  onOpenFile,
}) => {
  const [hoveredItem, setHoveredItem] = useState<HotspotItem | null>(null);

  if (!items || items.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: colors.text.muted, fontSize: '12px' }}>
        No hotspot files to display.
      </div>
    );
  }

  const totalLoc = items.reduce((sum, item) => sum + Math.max(10, item.loc), 0);

  // Determine color based on cognitive complexity
  const getColor = (comp: number) => {
    if (comp > 25) return { bg: 'rgba(201, 90, 90, 0.25)', border: 'rgba(201, 90, 90, 0.6)', text: colors.status.danger };
    if (comp > 15) return { bg: 'rgba(201, 148, 58, 0.25)', border: 'rgba(201, 148, 58, 0.6)', text: colors.status.warning };
    if (comp > 5) return { bg: 'rgba(91, 141, 239, 0.2)', border: 'rgba(91, 141, 239, 0.5)', text: colors.accent.blue };
    return { bg: 'rgba(76, 175, 121, 0.15)', border: 'rgba(76, 175, 121, 0.4)', text: colors.status.success };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Codebase Hotspot Map (LOC × Cognitive Complexity)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', color: colors.text.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors.status.danger }} />
            Critical (&gt;25)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors.status.warning }} />
            Review (&gt;15)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors.accent.blue }} />
            Moderate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors.status.success }} />
            Healthy
          </span>
        </div>
      </div>

      {/* Responsive Tiled Treemap Grid */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          minHeight: '140px',
          backgroundColor: colors.bg.surfaceSecondary,
          padding: '6px',
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.default}`,
          position: 'relative',
        }}
      >
        {items.map((item, idx) => {
          const sharePct = Math.max(12, Math.min(100, Math.round((Math.max(10, item.loc) / totalLoc) * 100)));
          const styling = getColor(item.complexity);
          const relPath = getRelativePath(item.file_path, repoPath);
          const basename = relPath.split('/').pop() || relPath;

          return (
            <div
              key={idx}
              onClick={() => onOpenFile(item.file_path)}
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                flexGrow: item.loc,
                flexBasis: `${sharePct}%`,
                minWidth: '80px',
                height: '60px',
                backgroundColor: styling.bg,
                border: `1px solid ${styling.border}`,
                borderRadius: radius.md,
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
                overflow: 'hidden',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: font.mono,
                    color: colors.text.primary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={relPath}
                >
                  {basename}
                </span>
                <span style={{ fontSize: '10px', color: styling.text, fontWeight: 600, flexShrink: 0 }}>
                  {item.complexity}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: colors.text.muted }}>
                <span>{item.loc} lines</span>
                <span>fan-in: {item.fan_in}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover Detail Inspector */}
      {hoveredItem && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: colors.bg.surface,
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: font.mono, color: colors.text.primary }}>
              {getRelativePath(hoveredItem.file_path, repoPath)}
            </span>
            <span style={{ color: colors.text.muted }}>—</span>
            <span style={{ color: colors.text.secondary }}>
              {hoveredItem.loc} LOC, Cognitive Complexity: {hoveredItem.complexity}, Fan-in: {hoveredItem.fan_in}
            </span>
          </div>
          <Badge variant={hoveredItem.complexity > 15 ? 'red' : 'green'}>
            {hoveredItem.complexity > 15 ? 'High Friction' : 'Normal'}
          </Badge>
        </div>
      )}
    </div>
  );
};
