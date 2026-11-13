import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    navigate(`/app/repositories/${repo.id}/explorer`);
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

  const handleDelete = async (repo: SavedRepository) => {
    const confirmed = window.confirm(`Are you sure you want to delete repository '${repo.name}'? This will remove its indexed data.`);
    if (!confirmed) return;

    try {
      await deleteUserRepository(repo.id);
      setRepositories((prev) => prev.filter((r) => r.id !== repo.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete repository.';
      setError(msg);
    }
  };

  const handleRepoCreated = (newRepo: SavedRepository) => {
    setRepositories((prev) => [newRepo, ...prev]);
    // Auto-scan newly added repository so it is indexed and ready immediately
    handleScan(newRepo);
  };

  return (
    <div
      style={{
        backgroundColor: '#0F1115',
        color: '#E6EAF0',
        minHeight: '100vh',
        width: '100%',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── App Top Navigation ─────────────────────────────────────────── */}
      <header
        style={{
          height: '52px',
          backgroundColor: '#151922',
          borderBottom: '1px solid #292F38',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: '#5B8DEF',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            A
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#E6EAF0' }}>
            Repository Scanner
          </span>
          <span style={{ color: '#6F7887', fontSize: '13px' }}>/</span>
          <span style={{ fontSize: '13px', color: '#A0A8B5' }}>Workspace</span>
        </div>

        {/* User Account Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            <div style={{ color: '#E6EAF0', fontWeight: 500 }}>{user?.name || 'Developer'}</div>
            <div style={{ color: '#6F7887', fontSize: '11px' }}>{user?.email || 'dev@local'}</div>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="btn-ghost"
            title="Log Out"
            style={{ padding: '6px 10px', height: '28px', color: '#6F7887' }}
          >
            <LogOut size={14} />
            <span style={{ fontSize: '11px' }}>Sign Out</span>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '36px 24px' }}>
        {/* Workspace Title & Quota Meter Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '28px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px', color: '#E6EAF0' }}>
              My Repositories
            </h1>
            <p style={{ fontSize: '13px', color: '#A0A8B5', margin: 0 }}>
              Manage and analyze your saved codebases
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quota Badge */}
            <div
              style={{
                backgroundColor: isLimitReached ? 'rgba(201, 148, 58, 0.1)' : '#1B2028',
                border: `1px solid ${isLimitReached ? 'rgba(201, 148, 58, 0.3)' : '#292F38'}`,
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <HardDrive size={13} style={{ color: isLimitReached ? '#C9943A' : '#5B8DEF' }} />
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                  color: isLimitReached ? '#C9943A' : '#E6EAF0',
                }}
              >
                {count} / {maxLimit}
              </span>
              <span style={{ color: '#6F7887', fontSize: '11px' }}>repositories</span>
            </div>

            {/* Add Repository Action */}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isLimitReached}
              className="btn-primary"
              style={{
                padding: '7px 16px',
                fontSize: '13px',
                opacity: isLimitReached ? 0.5 : 1,
                cursor: isLimitReached ? 'not-allowed' : 'pointer',
              }}
              title={isLimitReached ? "You've reached your 5 repository limit" : 'Add a repository'}
            >
              <Plus size={15} />
              <span>Add Repository</span>
            </button>
          </div>
        </div>

        {/* Limit Reached Banner */}
        {isLimitReached && (
          <div
            style={{
              backgroundColor: 'rgba(201, 148, 58, 0.08)',
              border: '1px solid rgba(201, 148, 58, 0.25)',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              color: '#C9943A',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>
              You have reached your 5 repository limit. To analyze a new repository, delete an existing one.
            </span>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              backgroundColor: 'rgba(201, 90, 90, 0.1)',
              border: '1px solid rgba(201, 90, 90, 0.25)',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              color: '#C95A5A',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              padding: '60px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: '#6F7887',
            }}
          >
            <Loader2 size={24} style={{ color: '#5B8DEF', animation: 'ds-spin 1s linear infinite' }} />
            <span style={{ fontSize: '13px' }}>Loading saved repositories...</span>
          </div>
        ) : count === 0 ? (
          /* Empty State */
          <div
            style={{
              backgroundColor: '#151922',
              border: '1px dashed #292F38',
              borderRadius: '8px',
              padding: '64px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                backgroundColor: '#1B2028',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6F7887',
                marginBottom: '4px',
              }}
            >
              <FolderGit2 size={24} />
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#E6EAF0', margin: 0 }}>
              No repositories yet
            </h2>
            <p style={{ fontSize: '13px', color: '#6F7887', maxWidth: '360px', margin: 0 }}>
              Add your first repository to start analyzing dependencies, architecture, and code health.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary"
              style={{ marginTop: '8px', padding: '8px 18px', fontSize: '13px' }}
            >
              <Plus size={14} />
              <span>Add Repository</span>
            </button>
          </div>
        ) : (
          /* Repository List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {repositories.map((repo) => {
              const scanInfo = activeScans[repo.id];
              const isScanning = Boolean(
                (scanInfo && (scanInfo.status === 'scanning' || scanInfo.status === 'pending')) ||
                repo.status === 'SCANNING'
              );
              const hasScanned =
                !isScanning &&
                (repo.status === 'READY' || (repo.file_count > 0 || (repo.total_files ?? 0) > 0));

              return (
                <div
                  key={repo.id}
                  data-testid={`repo-card-${repo.id}`}
                  style={{
                    backgroundColor: '#151922',
                    border: '1px solid #292F38',
                    borderRadius: '6px',
                    padding: '18px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '20px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3D4654')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#292F38')}
                >
                  {/* Left: Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#E6EAF0' }}>
                        {repo.name}
                      </span>

                      {/* Source Type */}
                      <span
                        style={{
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: '#1B2028',
                          color: '#A0A8B5',
                          border: '1px solid #292F38',
                        }}
                      >
                        {repo.source_type === 'github' ? <GitFork size={11} /> : <HardDrive size={11} />}
                        <span style={{ textTransform: 'capitalize' }}>{repo.source_type}</span>
                      </span>

                      {/* Status Badge */}
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            repo.status === 'READY' && !isScanning
                              ? 'rgba(76, 175, 121, 0.1)'
                              : isScanning
                              ? 'rgba(91, 141, 239, 0.1)'
                              : repo.status === 'FAILED'
                              ? 'rgba(201, 90, 90, 0.1)'
                              : '#1B2028',
                          color:
                            repo.status === 'READY' && !isScanning
                              ? '#4CAF79'
                              : isScanning
                              ? '#5B8DEF'
                              : repo.status === 'FAILED'
                              ? '#C95A5A'
                              : '#A0A8B5',
                          border: `1px solid ${
                            repo.status === 'READY' && !isScanning
                              ? 'rgba(76, 175, 121, 0.2)'
                              : isScanning
                              ? 'rgba(91, 141, 239, 0.2)'
                              : repo.status === 'FAILED'
                              ? 'rgba(201, 90, 90, 0.2)'
                              : '#292F38'
                          }`,
                        }}
                      >
                        {isScanning
                          ? scanInfo?.progress
                            ? `Scanning… ${Math.round(scanInfo.progress * 100)}%`
                            : 'Scanning…'
                          : repo.status}
                      </span>
                    </div>

                    {/* Path / Description */}
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#6F7887',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '8px',
                      }}
                      title={repo.source_path}
                    >
                      {repo.source_path}
                    </div>

                    {repo.description && (
                      <p style={{ fontSize: '12px', color: '#A0A8B5', margin: '0 0 8px', lineHeight: 1.5 }}>
                        {repo.description}
                      </p>
                    )}

                    {/* Scanning Error message if failed */}
                    {scanInfo?.error && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#C95A5A',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '8px',
                        }}
                      >
                        <AlertCircle size={12} />
                        <span>{scanInfo.error}</span>
                      </div>
                    )}

                    {/* Metadata chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#6F7887' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FileCode size={12} />
                        <span style={{ color: '#A0A8B5' }}>{repo.file_count ?? repo.total_files ?? 0}</span> files
                      </span>

                      {(repo.total_lines ?? 0) > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Layers size={12} />
                          <span style={{ color: '#A0A8B5' }}>{repo.total_lines?.toLocaleString()}</span> lines
                        </span>
                      )}

                      {repo.language && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#5B8DEF' }} />
                          <span style={{ color: '#A0A8B5' }}>{repo.language}</span>
                        </span>
                      )}

                      {repo.last_scanned_at && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={12} />
                          <span>Scanned {new Date(repo.last_scanned_at).toLocaleDateString()}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleScan(repo)}
                      disabled={isScanning}
                      className="btn-secondary"
                      title="Scan / Re-index repository"
                      style={{ height: '32px', padding: '0 10px' }}
                    >
                      <RefreshCw size={13} style={{ animation: isScanning ? 'ds-spin 1s linear infinite' : 'none' }} />
                      <span style={{ fontSize: '12px' }}>{isScanning ? 'Scanning…' : hasScanned ? 'Rescan' : 'Scan'}</span>
                    </button>

                    <button
                      onClick={() => handleOpen(repo)}
                      disabled={isScanning || !hasScanned}
                      className="btn-primary"
                      title={isScanning ? 'Scan in progress' : !hasScanned ? 'Scan repository before opening' : 'Open repository workspace'}
                      style={{
                        height: '32px',
                        padding: '0 14px',
                        opacity: isScanning || !hasScanned ? 0.5 : 1,
                        cursor: isScanning || !hasScanned ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Play size={13} />
                      <span style={{ fontSize: '12px' }}>Open</span>
                    </button>

                    <button
                      onClick={() => handleDelete(repo)}
                      className="btn-ghost"
                      title="Delete repository"
                      style={{ height: '32px', width: '32px', padding: 0, color: '#6F7887' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#C95A5A')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#6F7887')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Repository Modal */}
      <AddRepositoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleRepoCreated}
        currentCount={count}
        maxLimit={maxLimit}
      />
    </div>
  );
};
