import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  Globe,
  Clock,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { browseFolder } from '../services/repository';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';

function getRepoBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

export const RepositoryModal: React.FC = () => {
  const isOpen = useWorkspaceStore((s) => s.isRepoModalOpen);
  const setOpen = useWorkspaceStore((s) => s.setRepoModalOpen);
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const scanStatus = useWorkspaceStore((s) => s.scanStatus);
  const scanError = useWorkspaceStore((s) => s.scanError);
  const scanRepo = useWorkspaceStore((s) => s.scanRepo);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const recentRepositories = useWorkspaceStore((s) => s.recentRepositories);

  const [activeTab, setActiveTab] = useState<'local' | 'github' | 'recents'>('local');
  const [localPath, setLocalPath] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const localInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isScanning = scanStatus === 'scanning';

  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      if (activeTab === 'local') {
        setTimeout(() => localInputRef.current?.focus(), 50);
      }
    }
  }, [isOpen, activeTab]);

  const handleBrowseFolder = async () => {
    setLocalError(null);
    setIsBrowsing(true);
    try {
      if (window.electronAPI && window.electronAPI.selectDirectory) {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
          setLocalPath(path);
          await scanRepo(path);
          setOpen(false);
        }
      } else {
        const res = await browseFolder();
        if (res && res.path) {
          setLocalPath(res.path);
          await scanRepo(res.path);
          setOpen(false);
        } else if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to open directory browser.');
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleWebkitDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const first = files[0];
      const relativePath = (first as any).webkitRelativePath || '';
      const rootFolder = relativePath.split('/')[0] || '';
      if (rootFolder) {
        setLocalPath(rootFolder);
        setLocalError(
          `Selected "${rootFolder}". Note: Enter the full path on disk (e.g. D:\\projects\\${rootFolder}) or use Browse Folder.`
        );
      }
    }
  };

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim() || isScanning) return;
    setLocalError(null);
    await scanRepo(localPath.trim());
    if (useWorkspaceStore.getState().scanStatus !== 'error') {
      setOpen(false);
    }
  };

  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim() || isScanning) return;
    setLocalError(null);
    await scanRepo(githubUrl.trim());
    if (useWorkspaceStore.getState().scanStatus !== 'error') {
      setOpen(false);
    }
  };

  const handleSelectRecent = async (repo: string) => {
    await scanRepo(repo);
    if (useWorkspaceStore.getState().scanStatus !== 'error') {
      setOpen(false);
    }
  };

  const handleUnloadWorkspace = () => {
    clearWorkspace();
    setOpen(false);
  };

  const sampleRepos = [
    { name: 'Pallets Flask', url: 'https://github.com/pallets/flask' },
    { name: 'FastAPI', url: 'https://github.com/fastapi/fastapi' },
    { name: 'Express.js', url: 'https://github.com/expressjs/express' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isScanning && setOpen(false)}>
      {/* Hidden fallback webkitdirectory input */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleWebkitDirectoryChange}
      />

      <DialogContent className="max-w-[580px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#F2A93B]/30 bg-[#F2A93B]/10 text-[#F2A93B]">
              <FolderOpen size={15} />
            </div>
            <div>
              <DialogTitle>Switch or Open Repository</DialogTitle>
              <DialogDescription>
                Scan local code from your PC or load any public GitHub repository
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {activeRepository && (
          <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[#262B28] bg-[#1C201D] px-3 py-2 text-[12px] mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Folder size={14} className="text-[#F2A93B] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A928B]">
                  Current workspace:
                </span>
                <span
                  className="font-mono text-[12px] font-medium text-[#E9ECE6] truncate"
                  title={activeRepository}
                >
                  {getRepoBasename(activeRepository)}
                </span>
              </div>
            </div>
            <button
              onClick={handleUnloadWorkspace}
              title="Close current workspace"
              className="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium text-[#E5654B] hover:bg-[#E5654B]/10"
            >
              <Trash2 size={12} />
              <span>Unload</span>
            </button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="local" className="gap-1.5">
              <FolderOpen size={13} />
              <span>Local Folder</span>
            </TabsTrigger>
            <TabsTrigger value="github" className="gap-1.5">
              <Globe size={13} />
              <span>Public GitHub</span>
            </TabsTrigger>
            <TabsTrigger value="recents" className="gap-1.5">
              <Clock size={13} />
              <span>Recents ({recentRepositories.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: LOCAL */}
          <TabsContent value="local">
            <form onSubmit={handleLocalSubmit} className="flex flex-col gap-3.5 pt-2">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#8A928B] mb-1.5">
                  Local Repository Directory
                </label>
                <div className="flex gap-2">
                  <input
                    ref={localInputRef}
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="e.g. D:\projects\summer-project-1 or /home/user/my-app"
                    disabled={isScanning}
                    className="flex-1 h-[34px] rounded-[4px] border border-[#262B28] bg-[#0D0F0E] px-3 font-mono text-[12px] text-[#E9ECE6] outline-none transition-colors focus:border-[#F2A93B]"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={isScanning || isBrowsing}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[4px] border border-[#262B28] bg-[#1C201D] px-3 text-[12px] font-medium text-[#E9ECE6] transition-colors hover:border-[#F2A93B] disabled:opacity-40"
                  >
                    {isBrowsing ? (
                      <RefreshCw size={13} className="animate-spin text-[#F2A93B]" />
                    ) : (
                      <FolderOpen size={13} className="text-[#F2A93B]" />
                    )}
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              <div className="rounded-[4px] border border-[#262B28] bg-[#1C201D] p-2.5 text-[11px] text-[#8A928B] leading-relaxed">
                Click <strong>Browse</strong> to select any project folder, or paste its full path directly.
              </div>

              {localError && (
                <div className="flex items-center gap-2 rounded-[4px] border border-[#E5654B]/30 bg-[#E5654B]/10 p-2.5 text-[12px] text-[#E5654B]">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{localError}</span>
                </div>
              )}

              {scanError && (
                <div className="flex items-center gap-2 rounded-[4px] border border-[#E5654B]/30 bg-[#E5654B]/10 p-2.5 text-[12px] text-[#E5654B]">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#262B28]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isScanning}
                  className="h-[32px] rounded-[4px] px-3 text-[12px] font-medium text-[#8A928B] hover:text-[#E9ECE6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!localPath.trim() || isScanning}
                  className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] bg-[#F2A93B] px-4 text-[12px] font-semibold text-[#0D0F0E] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Scanning...</span>
                    </>
                  ) : (
                    'Scan Repository'
                  )}
                </button>
              </div>
            </form>
          </TabsContent>

          {/* TAB 2: GITHUB */}
          <TabsContent value="github">
            <form onSubmit={handleGitHubSubmit} className="flex flex-col gap-3.5 pt-2">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#8A928B] mb-1.5">
                  Public GitHub Repository URL
                </label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  disabled={isScanning}
                  className="w-full h-[34px] rounded-[4px] border border-[#262B28] bg-[#0D0F0E] px-3 font-mono text-[12px] text-[#E9ECE6] outline-none transition-colors focus:border-[#F2A93B]"
                />
              </div>

              <div>
                <span className="flex items-center gap-1 text-[11px] text-[#8A928B] mb-1.5">
                  <Sparkles size={11} className="text-[#F2A93B]" /> Quick popular repositories:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleRepos.map((sample) => (
                    <button
                      key={sample.url}
                      type="button"
                      onClick={() => setGithubUrl(sample.url)}
                      className="rounded-[4px] border border-[#262B28] bg-[#1C201D] px-2.5 py-1 text-[11px] text-[#8A928B] transition-colors hover:border-[#F2A93B] hover:text-[#E9ECE6]"
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[4px] border border-[#262B28] bg-[#1C201D] p-2.5 text-[11px] text-[#8A928B] leading-relaxed">
                Clones into an isolated local cache, generates syntax & dependency trees, and prepares semantic search.
              </div>

              {scanError && (
                <div className="flex items-center gap-2 rounded-[4px] border border-[#E5654B]/30 bg-[#E5654B]/10 p-2.5 text-[12px] text-[#E5654B]">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#262B28]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isScanning}
                  className="h-[32px] rounded-[4px] px-3 text-[12px] font-medium text-[#8A928B] hover:text-[#E9ECE6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!githubUrl.trim() || isScanning}
                  className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] bg-[#F2A93B] px-4 text-[12px] font-semibold text-[#0D0F0E] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Cloning...</span>
                    </>
                  ) : (
                    'Clone & Index'
                  )}
                </button>
              </div>
            </form>
          </TabsContent>

          {/* TAB 3: RECENTS */}
          <TabsContent value="recents">
            <div className="flex flex-col gap-2 pt-2">
              {recentRepositories.length === 0 ? (
                <div className="py-8 text-center font-mono text-[12px] text-[#8A928B]">
                  No recent repositories found.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                  {recentRepositories.map((repo) => {
                    const isCurrent = repo === activeRepository;
                    return (
                      <div
                        key={repo}
                        onClick={() => !isScanning && handleSelectRecent(repo)}
                        className={`flex items-center justify-between rounded-[4px] border p-2.5 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'border-[#F2A93B]/40 bg-[#F2A93B]/10'
                            : 'border-[#262B28] bg-[#1C201D] hover:border-[#3A423D] hover:bg-[#262B28]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Folder size={14} className="text-[#F2A93B] shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-sans text-[12px] font-medium text-[#E9ECE6] truncate">
                              {getRepoBasename(repo)}
                            </span>
                            <span className="font-mono text-[10px] text-[#8A928B] truncate">
                              {repo}
                            </span>
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="rounded-[2px] bg-[#F2A93B]/20 px-1.5 py-0.5 font-mono text-[10px] uppercase font-semibold text-[#F2A93B]">
                            Active
                          </span>
                        ) : (
                          <ArrowRight size={13} className="text-[#8A928B]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-[#262B28]">
                <button
                  type="button"
                  onClick={handleUnloadWorkspace}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[#E5654B] hover:underline"
                >
                  <Trash2 size={12} />
                  <span>Clear All Workspace Data</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-[30px] rounded-[4px] border border-[#262B28] bg-[#1C201D] px-3 text-[12px] font-medium text-[#E9ECE6] hover:bg-[#262B28]"
                >
                  Close
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
