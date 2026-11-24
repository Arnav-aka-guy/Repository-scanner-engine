import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './ui/Tooltip';

interface StatusBarProps {
  repoPath?: string;
  repoName?: string;
  connected?: boolean;
  totalFiles?: number;
  totalLines?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  repoPath,
  repoName,
  totalFiles = 0,
  totalLines = 0,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeModel, setActiveModel] = useState('—');

  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanError = useWorkspaceStore((s) => s.scanError);
  const currentScanJobId = useWorkspaceStore((s) => s.currentScanJobId);
  const cancelScan = useWorkspaceStore((s) => s.cancelScan);

  useEffect(() => {
    let isMounted = true;
    let consecutiveFailures = 0;

    const checkHealth = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        let healthRes = await fetch('/api/health', { signal: controller.signal });
        if (!healthRes.ok) {
          healthRes = await fetch('/health', { signal: controller.signal });
        }
        clearTimeout(timeoutId);

        if (healthRes.ok) {
          const data = await healthRes.json();
          if (isMounted) {
            consecutiveFailures = 0;
            setIsConnected(true);
            setActiveModel(data.embedding_model || '—');
          }
        } else {
          consecutiveFailures++;
          if (isMounted && consecutiveFailures >= 2) {
            setIsConnected(false);
          }
        }
      } catch {
        clearTimeout(timeoutId);
        consecutiveFailures++;
        if (isMounted && consecutiveFailures >= 2) {
          setIsConnected(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const displayName = repoName || (repoPath ? repoPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() : null);

  const getRepoStatusText = () => {
    if (!repoPath) return { text: 'No repository selected', tone: 'text-fg-4', dot: 'bg-fg-4' };
    const prefix = displayName ? `${displayName}: ` : '';
    if (scanStatus === 'scanning') return { text: `${prefix}Scanning and indexing…`, tone: 'text-ion', dot: 'bg-ion live-dot' };
    if (scanStatus === 'indexed') return { text: `${prefix}Indexed`, tone: 'text-fg-3', dot: 'bg-mint' };
    if (scanStatus === 'error') return { text: scanError ? `${prefix}Scan failed: ${scanError}` : `${prefix}Scan failed`, tone: 'text-rose', dot: 'bg-rose' };
    return { text: `${prefix}Loaded`, tone: 'text-fg-3', dot: 'bg-fg-4' };
  };

  const repoStatus = getRepoStatusText();

  return (
    <TooltipProvider delayDuration={200}>
      <footer className="flex h-[28px] min-h-[28px] w-full shrink-0 select-none items-center justify-between gap-3 border-t border-line bg-ink px-4 text-[12px] text-fg-3">
        <div className="flex min-w-0 items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex shrink-0 cursor-default items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? 'bg-mint' : 'bg-rose'}`} />
                <span className={isConnected ? '' : 'text-rose'}>{isConnected ? 'Backend connected' : 'Backend unavailable'}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isConnected ? 'The API server is responding' : 'Cannot reach the API server. Retrying every 25 seconds.'}
            </TooltipContent>
          </Tooltip>

          <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
            {repoPath && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${repoStatus.dot}`} />}
            <span className={`truncate ${repoStatus.tone}`}>{repoStatus.text}</span>
            {scanStatus === 'scanning' && currentScanJobId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelScan();
                }}
                className="ml-1 rounded border border-rose/40 px-1.5 text-[12.5px] text-rose hover:bg-rose/10"
                title="Stop the running scan"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {repoPath && (
            <div className="hidden items-center gap-3 tabular-nums sm:flex">
              <span>
                <strong className="font-semibold text-fg">{totalFiles.toLocaleString()}</strong> files
              </span>
              <span>
                <strong className="font-semibold text-fg">{totalLines.toLocaleString()}</strong> lines
              </span>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden cursor-default items-center gap-1.5 md:flex">
                <Cpu size={12} className="shrink-0 text-fg-4" />
                <span className="max-w-[180px] truncate">{activeModel}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">Embedding model used for search</TooltipContent>
          </Tooltip>
        </div>
      </footer>
    </TooltipProvider>
  );
};
