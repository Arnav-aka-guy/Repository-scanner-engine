import React, { useState } from 'react';
import { Folder, GitFork, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { browseFolder, createUserRepository } from '../services/repository';
import { SavedRepository } from '../types/repository';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="!max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Saved to your personal workspace ({currentCount} / {maxLimit} used)
          </DialogDescription>
        </DialogHeader>

        {isLimitReached && (
          <div className="flex items-center gap-2 rounded-[6px] border border-[#FFB020]/30 bg-[#FFB020]/10 p-2.5 text-[12px] text-[#FFB020] mb-3">
            <AlertCircle size={15} className="shrink-0" />
            <span>You have reached the maximum limit of 5 saved repositories. Delete one to add another.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-[6px] border border-[#FF5C7A]/30 bg-[#FF5C7A]/10 p-2.5 text-[12px] text-[#FF5C7A] mb-3">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-mono text-[#9A9AA3] mb-1.5">
              Source Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSourceType('local')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-[12px] font-medium transition-colors ${
                  sourceType === 'local'
                    ? 'border-[#35D7FF] bg-[#35D7FF]/10 text-[#35D7FF]'
                    : 'border-[#222228] bg-[#000000] text-[#9A9AA3] hover:text-[#F4F4F5]'
                }`}
              >
                <HardDrive size={14} />
                <span>Local Directory</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType('github')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-[12px] font-medium transition-colors ${
                  sourceType === 'github'
                    ? 'border-[#35D7FF] bg-[#35D7FF]/10 text-[#35D7FF]'
                    : 'border-[#222228] bg-[#000000] text-[#9A9AA3] hover:text-[#F4F4F5]'
                }`}
              >
                <GitFork size={14} />
                <span>Public GitHub</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#9A9AA3] mb-1.5">
              Repository Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Backend Engine"
              disabled={isLoading || isLimitReached}
              className="w-full h-[34px] rounded-[6px] border border-[#222228] bg-[#000000] px-3 text-[13px] text-[#F4F4F5] outline-none transition-colors focus:border-[#35D7FF]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#9A9AA3] mb-1.5">
              {sourceType === 'local' ? 'Local Directory Path' : 'GitHub Repository URL'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder={sourceType === 'local' ? 'D:/projects/my-app' : 'https://github.com/owner/repo'}
                disabled={isLoading || isLimitReached}
                className="flex-1 h-[34px] rounded-[6px] border border-[#222228] bg-[#000000] px-3 font-mono text-[12px] text-[#F4F4F5] outline-none transition-colors focus:border-[#35D7FF]"
              />
              {sourceType === 'local' && (
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={isBrowsing || isLoading || isLimitReached}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-[6px] border border-[#222228] bg-[#18181C] px-3 text-[12px] font-medium text-[#F4F4F5] transition-colors hover:border-[#35D7FF] disabled:opacity-40"
                >
                  {isBrowsing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Folder size={13} />
                  )}
                  <span>Browse</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#9A9AA3] mb-1.5">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of this repository"
              disabled={isLoading || isLimitReached}
              className="w-full h-[34px] rounded-[6px] border border-[#222228] bg-[#000000] px-3 text-[13px] text-[#F4F4F5] outline-none transition-colors focus:border-[#35D7FF]"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#222228]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="h-[32px] rounded-[6px] px-3 text-[12px] font-medium text-[#9A9AA3] hover:text-[#F4F4F5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isLimitReached}
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-fg px-4 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                'Add Repository'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
