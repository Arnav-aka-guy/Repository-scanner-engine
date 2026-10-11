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

  const getRepoStatusText = () => {
    if (!repoPath) return { text: 'No repository selected', color: '#5E645F' };
    if (scanStatus === 'scanning') return { text: 'Scanning & indexing...', color: '#F2A93B' };
    if (scanStatus === 'indexed') return { text: 'Repository indexed', color: '#7FB77E' };
    if (scanStatus === 'error') return { text: scanError ? `Scan error: ${scanError}` : 'Scan failed', color: '#E5654B' };
    return { text: 'Repository loaded', color: '#8A928B' };
  };

  const repoStatus = getRepoStatusText();

  return (
    <TooltipProvider delayDuration={200}>
      <footer className="h-[26px] min-h-[26px] w-full border-t border-[#262B28] bg-[#151816] flex items-center justify-between px-3 text-[11px] font-sans select-none shrink-0 text-[#8A928B]">
        {/* ── Left section: Meaningful status disclosures ── */}
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Backend Connectivity Status */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 shrink-0 cursor-default">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isConnected ? '#7FB77E' : '#E5654B' }}
                />
                <span className={isConnected ? 'text-[#8A928B]' : 'text-[#E5654B]'}>
                  {isConnected ? 'Backend connected' : 'Backend unavailable'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isConnected ? 'FastAPI daemon healthy' : 'Connection refused — retrying every 25s'}
            </TooltipContent>
          </Tooltip>

          <span className="text-[#262B28]">|</span>

          {/* Repository State Status */}
          <div className="flex items-center gap-1.5 overflow-hidden">
            {repoPath && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: repoStatus.color }}
              />
            )}
            <span
              className="truncate"
              style={{ color: repoStatus.color }}
            >
              {repoStatus.text}
            </span>
          </div>
        </div>

        {/* ── Right section: Metrics & Model context ── */}
        <div className="flex items-center gap-3 shrink-0">
          {repoPath && (
            <div className="flex items-center gap-2.5 font-mono text-[10px] tabular-nums text-[#8A928B]">
              <span>
                <strong className="font-semibold text-[#E9ECE6]">
                  {totalFiles.toLocaleString()}
                </strong>{' '}
                files
              </span>
              <span>
                <strong className="font-semibold text-[#E9ECE6]">
                  {totalLines.toLocaleString()}
                </strong>{' '}
                lines
              </span>
            </div>
          )}

          {/* Embedding Model Badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] border border-[#262B28] bg-[#1C201D] text-[10px] font-mono text-[#8A928B] cursor-default">
                <Cpu size={10} className="text-[#F2A93B] shrink-0" />
                <span>{activeModel}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">Active Vector Embedding Model</TooltipContent>
          </Tooltip>
        </div>
      </footer>
    </TooltipProvider>
  );
};
