import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  Globe,
  Clock,
  X,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { browseFolder } from '../services/repository';
import { colors, radius, font } from '../design-system/tokens';
import { Button } from '../design-system/primitives';

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

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      if (activeTab === 'local') {
        setTimeout(() => localInputRef.current?.focus(), 50);
      }
    }
  }, [isOpen, activeTab]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  if (!isOpen) return null;

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
        // Call backend native OS picker
        const res = await browseFolder();
        if (res && res.path) {
          setLocalPath(res.path);
          await scanRepo(res.path);
          setOpen(false);
        } else {
          // If native dialog returned empty or unavailable, click hidden file input as fallback
          if (fileInputRef.current) {
            fileInputRef.current.click();
          }
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
      // In web browser, webkitdirectory provides files with webkitRelativePath
      const first = files[0];
      const relativePath = (first as any).webkitRelativePath || '';
      const rootFolder = relativePath.split('/')[0] || '';
      if (rootFolder) {
        setLocalPath(rootFolder);
        setLocalError(
          `Selected "${rootFolder}". Note: For full local filesystem scanning, provide the full path on disk (e.g. D:\\projects\\${rootFolder}) or use the Browse Folder button.`
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isScanning) {
          setOpen(false);
        }
      }}
    >
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

      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: colors.bg.surface,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.lg,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'ds-fade-in 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border.default}`,
            backgroundColor: colors.bg.surfaceSecondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: radius.md,
                backgroundColor: 'rgba(91, 141, 239, 0.12)',
                border: '1px solid rgba(91, 141, 239, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.accent.blue,
              }}
            >
              <FolderOpen size={16} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: font.size.base,
                  fontWeight: font.weight.semibold,
                  color: colors.text.primary,
                  fontFamily: font.sans,
                  margin: 0,
                  lineHeight: '1.2',
                }}
              >
                Switch or Open Repository
              </h2>
              <span
                style={{
                  fontSize: font.size.xs,
                  color: colors.text.muted,
                  fontFamily: font.sans,
                }}
              >
                Scan local code from your PC or load any public GitHub repository
              </span>
            </div>
          </div>

          <button
            onClick={() => setOpen(false)}
            disabled={isScanning}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              borderRadius: radius.sm,
              cursor: isScanning ? 'not-allowed' : 'pointer',
              color: colors.text.muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Currently Active Repository Notice ── */}
        {activeRepository && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(91, 141, 239, 0.06)',
              borderBottom: `1px solid ${colors.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Folder size={14} style={{ color: colors.accent.blue, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: '11px', color: colors.text.muted, fontFamily: font.sans }}>
                  Current workspace:
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: font.weight.medium,
                    color: colors.text.primary,
                    fontFamily: font.mono,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={activeRepository}
                >
                  {getRepoBasename(activeRepository)}
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={12} />}
              onClick={handleUnloadWorkspace}
              title="Close current workspace and reset views"
              style={{ color: colors.status.danger, fontSize: '11px' }}
            >
              Unload
            </Button>
          </div>
        )}

        {/* ── Tabs Navigation ── */}
        <div
          style={{
            display: 'flex',
            padding: '0 20px',
            borderBottom: `1px solid ${colors.border.default}`,
            gap: '16px',
            backgroundColor: colors.bg.surface,
          }}
        >
          <button
            onClick={() => setActiveTab('local')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 2px',
              border: 'none',
              background: 'transparent',
              fontSize: font.size.sm,
              fontWeight: activeTab === 'local' ? font.weight.semibold : font.weight.normal,
              color: activeTab === 'local' ? colors.accent.blue : colors.text.secondary,
              borderBottom: `2px solid ${activeTab === 'local' ? colors.accent.blue : 'transparent'}`,
              cursor: 'pointer',
              fontFamily: font.sans,
            }}
          >
            <FolderOpen size={14} />
            Local Folder
          </button>

          <button
            onClick={() => setActiveTab('github')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 2px',
              border: 'none',
              background: 'transparent',
              fontSize: font.size.sm,
              fontWeight: activeTab === 'github' ? font.weight.semibold : font.weight.normal,
              color: activeTab === 'github' ? colors.accent.blue : colors.text.secondary,
              borderBottom: `2px solid ${activeTab === 'github' ? colors.accent.blue : 'transparent'}`,
              cursor: 'pointer',
              fontFamily: font.sans,
            }}
          >
            <Globe size={14} />
            Public GitHub
          </button>

          <button
            onClick={() => setActiveTab('recents')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 2px',
              border: 'none',
              background: 'transparent',
              fontSize: font.size.sm,
              fontWeight: activeTab === 'recents' ? font.weight.semibold : font.weight.normal,
              color: activeTab === 'recents' ? colors.accent.blue : colors.text.secondary,
              borderBottom: `2px solid ${activeTab === 'recents' ? colors.accent.blue : 'transparent'}`,
              cursor: 'pointer',
              fontFamily: font.sans,
            }}
          >
            <Clock size={14} />
            Recents ({recentRepositories.length})
          </button>
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* TAB 1: LOCAL DIRECTORY */}
          {activeTab === 'local' && (
            <form onSubmit={handleLocalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    color: colors.text.muted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '6px',
                    fontFamily: font.sans,
                  }}
                >
                  Local Repository Directory
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    ref={localInputRef}
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="e.g. D:\projects\summer-project-1 or /home/user/my-app"
                    disabled={isScanning}
                    style={{
                      flex: 1,
                      height: '36px',
                      padding: '0 12px',
                      backgroundColor: colors.bg.primary,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: radius.md,
                      fontSize: font.size.sm,
                      color: colors.text.primary,
                      fontFamily: font.mono,
                      outline: 'none',
                    }}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleBrowseFolder}
                    disabled={isScanning || isBrowsing}
                    loading={isBrowsing}
                    icon={<FolderOpen size={14} />}
                    title="Open native folder picker"
                  >
                    Browse Folder
                  </Button>
                </div>
              </div>

              <div
                style={{
                  fontSize: font.size.xs,
                  color: colors.text.muted,
                  fontFamily: font.sans,
                  lineHeight: '1.5',
                  backgroundColor: colors.bg.surfaceSecondary,
                  padding: '10px 12px',
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border.subtle}`,
                }}
              >
                Click <strong>Browse Folder</strong> to open your operating system's native folder picker, or type/paste any absolute directory path from your computer.
              </div>

              {localError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(201, 90, 90, 0.1)',
                    border: '1px solid rgba(201, 90, 90, 0.25)',
                    borderRadius: radius.sm,
                    color: colors.status.danger,
                    fontSize: font.size.xs,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{localError}</span>
                </div>
              )}

              {scanError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(201, 90, 90, 0.1)',
                    border: '1px solid rgba(201, 90, 90, 0.25)',
                    borderRadius: radius.sm,
                    color: colors.status.danger,
                    fontSize: font.size.xs,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{scanError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={isScanning}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!localPath.trim() || isScanning}
                  loading={isScanning}
                  icon={<RefreshCw size={14} />}
                >
                  {isScanning ? 'Scanning Repository...' : 'Scan Repository'}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: PUBLIC GITHUB REPO */}
          {activeTab === 'github' && (
            <form onSubmit={handleGitHubSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    color: colors.text.muted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '6px',
                    fontFamily: font.sans,
                  }}
                >
                  Public GitHub Repository URL
                </label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  disabled={isScanning}
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    fontSize: font.size.sm,
                    color: colors.text.primary,
                    fontFamily: font.mono,
                    outline: 'none',
                  }}
                />
              </div>

              {/* Sample Quick Links */}
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: colors.text.muted,
                    fontFamily: font.sans,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginBottom: '6px',
                  }}
                >
                  <Sparkles size={11} style={{ color: colors.accent.blue }} /> Quick popular samples:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {sampleRepos.map((sample) => (
                    <button
                      key={sample.url}
                      type="button"
                      onClick={() => setGithubUrl(sample.url)}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: colors.bg.surfaceSecondary,
                        border: `1px solid ${colors.border.subtle}`,
                        borderRadius: radius.sm,
                        fontSize: '11px',
                        fontFamily: font.sans,
                        color: colors.text.secondary,
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bg.elevated)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary)}
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  fontSize: font.size.xs,
                  color: colors.text.muted,
                  fontFamily: font.sans,
                  lineHeight: '1.5',
                  backgroundColor: colors.bg.surfaceSecondary,
                  padding: '10px 12px',
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border.subtle}`,
                }}
              >
                Clones the public repository to a safe temporary workspace on your machine, extracts AST symbols, builds dependency graphs, and prepares semantic search index.
              </div>

              {scanError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(201, 90, 90, 0.1)',
                    border: '1px solid rgba(201, 90, 90, 0.25)',
                    borderRadius: radius.sm,
                    color: colors.status.danger,
                    fontSize: font.size.xs,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{scanError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={isScanning}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!githubUrl.trim() || isScanning}
                  loading={isScanning}
                  icon={<Globe size={14} />}
                >
                  {isScanning ? 'Cloning & Indexing...' : 'Clone & Index'}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 3: RECENTS */}
          {activeTab === 'recents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentRepositories.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '28px 16px',
                    color: colors.text.muted,
                    fontSize: font.size.sm,
                    fontFamily: font.sans,
                  }}
                >
                  No recent repositories found.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {recentRepositories.map((repo) => {
                    const isCurrent = repo === activeRepository;
                    return (
                      <div
                        key={repo}
                        onClick={() => !isScanning && handleSelectRecent(repo)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          backgroundColor: isCurrent ? 'rgba(91, 141, 239, 0.08)' : colors.bg.surfaceSecondary,
                          border: `1px solid ${isCurrent ? 'rgba(91, 141, 239, 0.3)' : colors.border.subtle}`,
                          borderRadius: radius.md,
                          cursor: isScanning ? 'not-allowed' : 'pointer',
                          transition: 'background-color 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrent) e.currentTarget.style.backgroundColor = colors.bg.elevated;
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary;
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <Folder size={15} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: font.size.sm,
                                fontWeight: font.weight.medium,
                                color: colors.text.primary,
                                fontFamily: font.sans,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {getRepoBasename(repo)}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: colors.text.muted,
                                fontFamily: font.mono,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {repo}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {isCurrent ? (
                            <span
                              style={{
                                fontSize: '10px',
                                color: colors.accent.blue,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                backgroundColor: 'rgba(91, 141, 239, 0.12)',
                                borderRadius: radius.sm,
                              }}
                            >
                              Active
                            </span>
                          ) : (
                            <ArrowRight size={14} style={{ color: colors.text.muted }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: `1px solid ${colors.border.subtle}`,
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleUnloadWorkspace}
                  icon={<Trash2 size={13} />}
                  style={{ color: colors.status.danger, fontSize: '12px' }}
                >
                  Clear All Workspace Data
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
