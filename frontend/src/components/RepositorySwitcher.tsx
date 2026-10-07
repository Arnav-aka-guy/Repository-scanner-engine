import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Check,
  Plus,
  FolderGit2,
  HardDrive,
  GitFork,
  Grid,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { getUserRepositories } from '../services/repository';
import { SavedRepository } from '../types/repository';
import { AddRepositoryModal } from './AddRepositoryModal';

export const RepositorySwitcher: React.FC = () => {
  const navigate = useNavigate();
  const { activeRepository, scanRepo } = useWorkspaceStore();
  const [repositories, setRepositories] = useState<SavedRepository[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchRepos = async () => {
    try {
      const res = await getUserRepositories();
      setRepositories(res.repositories || []);
    } catch {
      // silently fail if unauthenticated or error
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const activeRepo = repositories.find(
    (r) =>
      r.source_path === activeRepository ||
      r.source_path.replace(/\\/g, '/').replace(/\/+$/, '') ===
        (activeRepository || '').replace(/\\/g, '/').replace(/\/+$/, '')
  );

  const displayName = activeRepo?.name || (activeRepository ? activeRepository.split(/[\\/]/).pop() : 'Select Repository');
  const count = repositories.length;
  const maxLimit = 5;

  const handleSelect = (repo: SavedRepository) => {
    setIsOpen(false);
    if (activeRepository !== repo.source_path) {
      scanRepo(repo.source_path);
    }
    navigate(`/app/repositories/${repo.id}/explorer`);
  };

  const handleCreated = (repo: SavedRepository) => {
    setRepositories((prev) => [repo, ...prev]);
    handleSelect(repo);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Switcher Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          fetchRepos();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          backgroundColor: '#1B2028',
          border: '1px solid #292F38',
          borderRadius: '5px',
          color: '#E6EAF0',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'Inter, system-ui, sans-serif',
          maxWidth: '260px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#292F38')}
      >
        <FolderGit2 size={13} style={{ color: '#5B8DEF', flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
          }}
        >
          {displayName}
        </span>
        <ChevronDown size={12} style={{ color: '#6F7887', flexShrink: 0 }} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '280px',
            backgroundColor: '#151922',
            border: '1px solid #292F38',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #1E2530',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#6F7887',
            }}
          >
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              REPOSITORIES
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#A0A8B5' }}>
              {count} / {maxLimit}
            </span>
          </div>

          {/* List */}
          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px 0' }}>
            {repositories.map((repo) => {
              const isSelected =
                activeRepo?.id === repo.id ||
                repo.source_path === activeRepository;

              return (
                <div
                  key={repo.id}
                  onClick={() => handleSelect(repo)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    backgroundColor: isSelected ? '#1B2028' : 'transparent',
                    color: isSelected ? '#5B8DEF' : '#E6EAF0',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#1B2028';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {repo.source_type === 'github' ? (
                      <GitFork size={13} style={{ color: '#6F7887', flexShrink: 0 }} />
                    ) : (
                      <HardDrive size={13} style={{ color: '#6F7887', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {repo.name}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#6F7887',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {repo.file_count || 0} files
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check size={14} style={{ color: '#5B8DEF', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: '6px 8px',
              borderTop: '1px solid #1E2530',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsModalOpen(true);
              }}
              disabled={count >= maxLimit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                color: count >= maxLimit ? '#6F7887' : '#5B8DEF',
                cursor: count >= maxLimit ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
            >
              <Plus size={13} />
              <span>{count >= maxLimit ? 'Limit reached (5/5)' : 'Add Repository...'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/app');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#A0A8B5',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Grid size={13} />
              <span>Manage all repositories</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Repository Modal */}
      <AddRepositoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
        currentCount={count}
        maxLimit={maxLimit}
      />
    </div>
  );
};
