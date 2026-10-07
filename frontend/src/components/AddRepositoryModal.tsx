import React, { useState } from 'react';
import { X, Folder, GitFork, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { browseFolder, createUserRepository } from '../services/repository';
import { SavedRepository } from '../types/repository';

interface AddRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (repo: SavedRepository) => void;
  currentCount: number;
  maxLimit: number;
}

export const AddRepositoryModal: React.FC<AddRepositoryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  currentCount,
  maxLimit,
}) => {
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'local' | 'github'>('local');
  const [sourcePath, setSourcePath] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLimitReached = currentCount >= maxLimit;

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setError(null);
    try {
      const res = await browseFolder();
      if (res.path) {
        setSourcePath(res.path);
        if (!name) {
          const norm = res.path.replace(/\\/g, '/').replace(/\/+$/, '');
          const segs = norm.split('/');
          setName(segs[segs.length - 1] || 'My Repository');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Folder browse dialogue cancelled or failed.');
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) return;

    if (!name.trim()) {
      setError('Please provide a repository name.');
      return;
    }

    if (!sourcePath.trim()) {
      setError(
        sourceType === 'local'
          ? 'Please provide or browse a local directory path.'
          : 'Please provide a valid GitHub repository URL.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const repo = await createUserRepository({
        name: name.trim(),
        source_path: sourcePath.trim(),
        source_type: sourceType,
        description: description.trim() || undefined,
      });

      onCreated(repo);
      onClose();
      // Reset form
      setName('');
      setSourcePath('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to add repository.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#151922',
          border: '1px solid #292F38',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#E6EAF0', margin: 0 }}>
              Add Repository
            </h2>
            <p style={{ fontSize: '12px', color: '#6F7887', margin: '4px 0 0' }}>
              Saved to your personal workspace ({currentCount} / {maxLimit} used)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6F7887',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Limit Warning */}
        {isLimitReached && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(201, 148, 58, 0.1)',
              border: '1px solid rgba(201, 148, 58, 0.25)',
              borderRadius: '6px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#C9943A',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>You have reached the maximum limit of 5 saved repositories. Delete one to add another.</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(201, 90, 90, 0.1)',
              border: '1px solid rgba(201, 90, 90, 0.25)',
              borderRadius: '6px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#C95A5A',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Source Type Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#A0A8B5', marginBottom: '6px' }}>
              Source Type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSourceType('local')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: `1px solid ${sourceType === 'local' ? '#5B8DEF' : '#292F38'}`,
                  backgroundColor: sourceType === 'local' ? 'rgba(91, 141, 239, 0.1)' : '#0F1115',
                  color: sourceType === 'local' ? '#5B8DEF' : '#A0A8B5',
                }}
              >
                <HardDrive size={14} />
                <span>Local Directory</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType('github')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: `1px solid ${sourceType === 'github' ? '#5B8DEF' : '#292F38'}`,
                  backgroundColor: sourceType === 'github' ? 'rgba(91, 141, 239, 0.1)' : '#0F1115',
                  color: sourceType === 'github' ? '#5B8DEF' : '#A0A8B5',
                }}
              >
                <GitFork size={14} />
                <span>Public GitHub</span>
              </button>
            </div>
          </div>

          {/* Repository Name */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#A0A8B5', marginBottom: '6px' }}>
              Repository Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Backend Engine"
              disabled={isLoading || isLimitReached}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                backgroundColor: '#0F1115',
                color: '#E6EAF0',
                border: '1px solid #292F38',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
            />
          </div>

          {/* Source Location */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#A0A8B5', marginBottom: '6px' }}>
              {sourceType === 'local' ? 'Local Directory Path' : 'GitHub Repository URL'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder={sourceType === 'local' ? 'D:/projects/my-app' : 'https://github.com/owner/repo'}
                disabled={isLoading || isLimitReached}
                style={{
                  flex: 1,
                  height: '34px',
                  padding: '0 12px',
                  backgroundColor: '#0F1115',
                  color: '#E6EAF0',
                  border: '1px solid #292F38',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
              />
              {sourceType === 'local' && (
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={isBrowsing || isLoading || isLimitReached}
                  className="btn-secondary"
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  {isBrowsing ? (
                    <Loader2 size={13} style={{ animation: 'ds-spin 1s linear infinite' }} />
                  ) : (
                    <Folder size={13} />
                  )}
                  <span>Browse</span>
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#A0A8B5', marginBottom: '6px' }}>
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this codebase"
              disabled={isLoading || isLimitReached}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                backgroundColor: '#0F1115',
                color: '#E6EAF0',
                border: '1px solid #292F38',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn-ghost"
              style={{ height: '32px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isLimitReached}
              className="btn-primary"
              style={{ height: '32px', padding: '0 16px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} style={{ animation: 'ds-spin 1s linear infinite' }} />
                  <span>Adding repository...</span>
                </>
              ) : (
                'Add Repository'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
