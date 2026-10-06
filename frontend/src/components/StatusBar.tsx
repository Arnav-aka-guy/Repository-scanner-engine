import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { colors, font } from '../design-system/tokens';

interface StatusBarProps {
  repoPath?: string;
  connected?: boolean;
  totalFiles?: number;
  totalLines?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  repoPath,
  totalFiles = 0,
  totalLines = 0,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeModel, setActiveModel] = useState('—');

  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanError = useWorkspaceStore((s) => s.scanError);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        let healthRes = await fetch('/api/health');
        if (!healthRes.ok) {
          healthRes = await fetch('/health');
        }
        if (healthRes.ok) {
          const data = await healthRes.json();
          if (isMounted) {
            setIsConnected(true);
            setActiveModel(data.embedding_model || '—');
          }
        } else {
          if (isMounted) setIsConnected(false);
        }
      } catch {
        if (isMounted) setIsConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getRepoStatusText = () => {
    if (!repoPath) return { text: 'No repository selected', color: colors.text.muted };
    if (scanStatus === 'scanning') return { text: 'Scanning & indexing...', color: colors.accent.blue };
    if (scanStatus === 'indexed') return { text: 'Repository indexed', color: colors.status.success };
    if (scanStatus === 'error') return { text: scanError ? `Scan error: ${scanError}` : 'Scan failed', color: colors.status.danger };
    return { text: 'Repository loaded', color: colors.text.secondary };
  };

  const repoStatus = getRepoStatusText();

  return (
    <footer
      style={{
        height: '26px',
        minHeight: '26px',
        width: '100%',
        borderTop: `1px solid ${colors.border.default}`,
        backgroundColor: colors.bg.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        userSelect: 'none',
        flexShrink: 0,
        fontSize: '11px',
        fontFamily: font.sans,
      }}
    >
      {/* ── Left section: Meaningful status disclosures ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', overflow: 'hidden' }}>
        {/* Backend Connectivity Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isConnected ? colors.status.success : colors.status.danger,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              color: isConnected ? colors.text.secondary : colors.status.danger,
              fontFamily: font.sans,
            }}
          >
            {isConnected ? 'Backend connected' : 'Backend unavailable — reconnecting...'}
          </span>
        </div>

        {/* Vertical divider */}
        <span style={{ color: colors.border.strong }}>|</span>

        {/* Repository State Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {repoPath && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: repoStatus.color,
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              color: repoStatus.color,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {repoStatus.text}
          </span>
        </div>
      </div>

      {/* ── Right section: Metrics & Model context ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        {repoPath && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: colors.text.muted, fontFamily: font.mono }}>
            <span>
              <strong style={{ color: colors.text.primary, fontWeight: 500 }}>
                {totalFiles.toLocaleString()}
              </strong>{' '}
              files
            </span>
            <span>
              <strong style={{ color: colors.text.primary, fontWeight: 500 }}>
                {totalLines.toLocaleString()}
              </strong>{' '}
              lines
            </span>
          </div>
        )}

        {/* Embedding Model Badge */}
        <div
          title={`Active Embedding Model: ${activeModel}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '1px 6px',
            backgroundColor: colors.bg.surfaceSecondary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: '3px',
            color: colors.text.secondary,
            fontSize: '10px',
            fontFamily: font.mono,
          }}
        >
          <Cpu size={10} style={{ color: colors.accent.blue, flexShrink: 0 }} />
          <span>{activeModel}</span>
        </div>
      </div>
    </footer>
  );
};
