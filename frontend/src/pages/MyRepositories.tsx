import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  Clock,
  Layers,
  FileCode,
  HardDrive,
  GitFork,
  LogOut,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  getUserRepositories,
  getUserRepository,
  deleteUserRepository,
  scanUserRepository,
  subscribeScanEvents,
  getScanJobStatus,
} from '../services/repository';
import { SavedRepository } from '../types/repository';
import { AddRepositoryModal } from '../components/AddRepositoryModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/Dialog';
import { parseServerDate } from '../utils/date';
import { LogoMark } from '../components/brand/Logo';

interface ActiveScan {
  jobId: string;
  status: string;
  progress: number;
  message: string;
  error?: string;
}

export const MyRepositories: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, token, authEnabled } = useAuthStore();
  const { openRepository } = useWorkspaceStore();



  const [repositories, setRepositories] = useState<SavedRepository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeScans, setActiveScans] = useState<Record<number, ActiveScan>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maxLimit, setMaxLimit] = useState(5);
  const [repoToDelete, setRepoToDelete] = useState<SavedRepository | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeSubsRef = React.useRef<Map<number, () => void>>(new Map());

  useEffect(() => {
    const subs = activeSubsRef.current;
    return () => {
      subs.forEach((cleanup) => cleanup());
      subs.clear();
    };
  }, []);

  const fetchRepos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getUserRepositories();
      setRepositories(res.repositories || []);
      if (typeof res.max_limit === 'number') {
        setMaxLimit(res.max_limit);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch repositories.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authEnabled || !!token) {
      fetchRepos();
    } else {
      navigate('/login', { replace: true });
    }
  }, [token, authEnabled, navigate]);

  const count = repositories.length;
  const isLimitReached = count >= maxLimit;

  const handleOpen = (repo: SavedRepository) => {
    openRepository(repo);
    navigate(`/app/repositories/${repo.id}/overview`);
  };

  const handleScan = async (repo: SavedRepository) => {
    setRepositories((prev) =>
      prev.map((r) => (r.id === repo.id ? { ...r, status: 'SCANNING' } : r))
    );
    setActiveScans((prev) => ({
      ...prev,
      [repo.id]: { jobId: '', status: 'scanning', progress: 0, message: 'Initiating scan…' },
    }));

    try {
      const trigger = await scanUserRepository(repo.id);
      const jobId = trigger.job_id;

      setActiveScans((prev) => ({
        ...prev,
        [repo.id]: { jobId, status: 'scanning', progress: 0, message: 'Scan queued…' },
      }));

      const onComplete = async () => {
        try {
          const fresh = await getUserRepository(repo.id);
          setRepositories((prev) =>
            prev.map((r) => (r.id === repo.id ? fresh : r))
          );
        } catch {
          setRepositories((prev) =>
            prev.map((r) => (r.id === repo.id ? { ...r, status: 'READY' } : r))
          );
        } finally {
          setActiveScans((prev) => {
            const next = { ...prev };
            delete next[repo.id];
            return next;
          });
          const cleanup = activeSubsRef.current.get(repo.id);
          if (cleanup) {
            cleanup();
            activeSubsRef.current.delete(repo.id);
          }
        }
      };

      const onFailed = (errMsg: string) => {
        setRepositories((prev) =>
          prev.map((r) => (r.id === repo.id ? { ...r, status: 'FAILED' } : r))
        );
        setActiveScans((prev) => ({
          ...prev,
          [repo.id]: { jobId, status: 'failed', progress: 0, message: '', error: errMsg },
        }));
        const cleanup = activeSubsRef.current.get(repo.id);
        if (cleanup) {
          cleanup();
          activeSubsRef.current.delete(repo.id);
        }
      };

      const startPolling = () => {
        const intervalId = window.setInterval(async () => {
          try {
            const jobStatus = await getScanJobStatus(jobId);
            if (jobStatus.status === 'completed') {
              window.clearInterval(intervalId);
              await onComplete();
            } else if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
              window.clearInterval(intervalId);
              onFailed(jobStatus.error || jobStatus.message || 'Scan failed.');
            } else {
              setActiveScans((prev) => ({
                ...prev,
                [repo.id]: {
                  jobId,
                  status: jobStatus.status,
                  progress: jobStatus.progress || 0,
                  message: jobStatus.message || 'Scanning…',
                },
              }));
            }
          } catch {
            // Polling retry
          }
        }, 1500);

        activeSubsRef.current.set(repo.id, () => window.clearInterval(intervalId));
      };

      try {
        const unsubscribe = subscribeScanEvents(
          jobId,
          (job) => {
            setActiveScans((prev) => ({
              ...prev,
              [repo.id]: {
                jobId,
                status: job.status,
                progress: job.progress || 0,
                message: job.message || 'Scanning…',
              },
            }));
            if (job.status === 'completed') {
              onComplete();
            } else if (job.status === 'failed' || job.status === 'cancelled') {
              onFailed(job.error || job.message || 'Scan failed.');
            }
          },
          (status) => {
            if (status === 'completed') {
              onComplete();
            } else if (status === 'failed' || status === 'cancelled') {
              onFailed('Scan failed.');
            }
          },
          () => {
            startPolling();
          }
        );
        activeSubsRef.current.set(repo.id, unsubscribe);
      } catch {
        startPolling();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger scan.';
      setRepositories((prev) =>
        prev.map((r) => (r.id === repo.id ? { ...r, status: 'FAILED' } : r))
      );
      setActiveScans((prev) => ({
        ...prev,
        [repo.id]: { jobId: '', status: 'failed', progress: 0, message: '', error: msg },
      }));
    }
  };

  const handleDelete = (repo: SavedRepository) => {
    setRepoToDelete(repo);
  };

  const handleConfirmDelete = async () => {
    if (!repoToDelete) return;
    setIsDeleting(true);
    try {
      await deleteUserRepository(repoToDelete.id);
      setRepositories((prev) => prev.filter((r) => r.id !== repoToDelete.id));
      setRepoToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete repository.';
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRepoCreated = (newRepo: SavedRepository) => {
    setRepositories((prev) => [newRepo, ...prev]);
    // Auto-scan newly added repository so it is indexed and ready immediately
    handleScan(newRepo);
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-ink font-sans text-fg">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="hidden text-[14px] font-semibold tracking-[-0.01em] sm:inline">Repository Scanner</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-fg-2">
                {(user?.name || 'D').slice(0, 1).toUpperCase()}
              </span>
              <div className="hidden leading-tight sm:block">
                <div className="text-[13px] font-medium">{user?.name || 'Developer'}</div>
                <div className="text-[12px] text-fg-4">{user?.email || 'dev@local'}</div>
              </div>
            </div>
            {authEnabled && token && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="btn-ghost h-9 px-2.5"
                title="Sign out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="display text-[32px] leading-tight sm:text-[38px]">My Repositories</h1>
            <p className="mt-2 text-[15px] text-fg-3">Manage and analyze your saved codebases</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] tabular-nums ${
                isLimitReached ? 'border-amber/40 text-amber' : 'border-line text-fg-3'
              }`}
              title="Saved repositories out of your limit"
            >
              <Layers size={14} />
              {count} / {maxLimit} saved
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              disabled={isLimitReached}
              className="btn-primary h-9 px-4"
            >
              <Plus size={16} />
              Add Repository
            </button>
          </div>
        </div>

        {isLimitReached && (
          <p className="mt-5 rounded-[10px] border border-amber/30 bg-amber/[0.06] px-4 py-3 text-[13.5px] text-amber">
            You have reached the limit of {maxLimit} saved repositories. Delete one to add another.
          </p>
        )}

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-rose/30 bg-rose/[0.07] px-4 py-3 text-[13.5px] text-[#FF9AAE]">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-8">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((k) => (
                <div key={k} className="skeleton h-[92px]" />
              ))}
              <span className="sr-only">Loading saved repositories…</span>
            </div>
          ) : repositories.length === 0 ? (
            <div className="relative overflow-hidden rounded-[16px] border border-dashed border-line-strong px-6 py-16 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] border border-line bg-surface text-fg-2">
                <FolderGit2 size={22} />
              </span>
              <h2 className="mt-5 text-[19px] font-semibold">No repositories yet</h2>
              <p className="mx-auto mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-fg-3">
                Add your first repository to start analyzing dependencies, architecture, and code health.
              </p>
              <button type="button" onClick={() => setIsModalOpen(true)} className="btn-primary mx-auto mt-6 h-10 px-5">
                <Plus size={16} />
                Add your first repository
              </button>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[14px] border border-line bg-surface">
              {repositories.map((repo) => {
                const scanInfo = activeScans[repo.id];
                const isScanning = Boolean(
                  (scanInfo && (scanInfo.status === 'scanning' || scanInfo.status === 'pending')) ||
                    repo.status === 'SCANNING'
                );
                const hasScanned =
                  !isScanning && (repo.status === 'READY' || repo.file_count > 0 || (repo.total_files ?? 0) > 0);
                const status = isScanning
                  ? { label: 'Scanning…', cls: 'text-ion border-ion/30', dot: 'bg-ion live-dot' }
                  : repo.status === 'READY'
                    ? { label: 'Ready', cls: 'text-mint border-mint/30', dot: 'bg-mint' }
                    : repo.status === 'FAILED'
                      ? { label: 'Scan failed', cls: 'text-rose border-rose/30', dot: 'bg-rose' }
                      : repo.status === 'CANCELLED'
                        ? { label: 'Scan cancelled', cls: 'text-amber border-amber/30', dot: 'bg-amber' }
                      : { label: 'Not scanned', cls: 'text-fg-3 border-line', dot: 'bg-fg-4' };
                const pct = scanInfo?.progress ? Math.round(scanInfo.progress * 100) : 0;

                return (
                  <li
                    key={repo.id}
                    data-testid={`repo-card-${repo.id}`}
                    className="relative border-b border-line-soft px-5 py-5 last:border-b-0 sm:px-6"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[15px] font-semibold text-fg-2">
                          {repo.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-[16px] font-semibold">{repo.name}</h2>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[12px] ${status.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[12px] text-fg-4">
                              {repo.source_type === 'github' ? <GitFork size={12} /> : <HardDrive size={12} />}
                              {repo.source_type === 'github' ? 'GitHub' : 'Local'}
                            </span>
                          </div>
                          <div className="mt-1 truncate font-mono text-[12.5px] text-fg-4" title={repo.source_path}>
                            {repo.source_path}
                          </div>
                          {repo.description && <p className="mt-1.5 text-[13.5px] text-fg-3">{repo.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-3">
                            <span className="inline-flex items-center gap-1.5">
                              <FileCode size={13} />
                              <span className="text-fg-2">{repo.file_count ?? repo.total_files ?? 0}</span> files
                            </span>
                            {(repo.total_lines ?? 0) > 0 && (
                              <span>
                                <span className="text-fg-2">{repo.total_lines?.toLocaleString()}</span> lines
                              </span>
                            )}
                            {repo.language && <span className="text-fg-2">{repo.language}</span>}
                            {repo.last_scanned_at && (
                              <span className="inline-flex items-center gap-1.5">
                                <Clock size={13} />
                                Scanned {parseServerDate(repo.last_scanned_at)?.toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {scanInfo?.error && (
                            <div className="mt-2 flex items-start gap-1.5 text-[13px] text-rose">
                              <AlertCircle size={14} className="mt-0.5 shrink-0" />
                              <span>{scanInfo.error}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-14 md:pl-0">
                        <button
                          type="button"
                          onClick={() => handleScan(repo)}
                          disabled={isScanning}
                          title="Scan or re-index this repository"
                          className="btn-secondary h-9"
                        >
                          {isScanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                          <span>{isScanning ? (pct ? `Scanning… ${pct}%` : 'Scanning…') : hasScanned ? 'Rescan' : 'Scan'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpen(repo)}
                          disabled={isScanning || !hasScanned}
                          title={isScanning ? 'Scan in progress' : !hasScanned ? 'Scan the repository before opening it' : 'Open repository workspace'}
                          className="btn-primary h-9"
                        >
                          <Play size={14} />
                          <span>Open</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(repo)}
                          disabled={isScanning}
                          title="Delete repository"
                          aria-label={`Delete ${repo.name}`}
                          className="btn-ghost h-9 w-9 px-0 hover:!text-rose"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {isScanning && (
                      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-line-soft">
                        {pct > 0 ? (
                          <div className="h-full bg-ion transition-[width] duration-500" style={{ width: `${pct}%` }} />
                        ) : (
                          <div className="scan-beam h-full" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <AddRepositoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleRepoCreated}
        currentCount={count}
        maxLimit={maxLimit}
      />

      <Dialog open={!!repoToDelete} onOpenChange={(open) => !open && setRepoToDelete(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete {repoToDelete?.name}?</DialogTitle>
            <DialogDescription>
              This removes its scan and search index.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRepoToDelete(null)}
              disabled={isDeleting}
              className="btn-secondary h-9 px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="btn-primary h-9 bg-rose px-4 text-white hover:bg-rose/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
