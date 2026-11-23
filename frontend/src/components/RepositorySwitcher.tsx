import React, { useEffect, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/DropdownMenu';

export const RepositorySwitcher: React.FC = () => {
  const navigate = useNavigate();
  const { activeRepository, activeRepositoryId, scanRepo, openRepository } = useWorkspaceStore();
  const [repositories, setRepositories] = useState<SavedRepository[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maxLimit, setMaxLimit] = useState(5);

  const fetchRepos = async () => {
    try {
      const res = await getUserRepositories();
      setRepositories(res.repositories || []);
      if (typeof res.max_limit === 'number') {
        setMaxLimit(res.max_limit);
      }
    } catch {
      // silently fail if unauthenticated or error
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const activeRepo = repositories.find(
    (r) =>
      r.id === activeRepositoryId ||
      r.source_path === activeRepository ||
      r.path === activeRepository ||
      (r.source_path && r.source_path.replace(/\\/g, '/').replace(/\/+$/, '') ===
        (activeRepository || '').replace(/\\/g, '/').replace(/\/+$/, '')) ||
      (r.path && r.path.replace(/\\/g, '/').replace(/\/+$/, '') ===
        (activeRepository || '').replace(/\\/g, '/').replace(/\/+$/, ''))
  );

  const displayName =
    activeRepo?.name ||
    (activeRepository ? activeRepository.split(/[\\/]/).pop() : 'Select Repository');
  const count = repositories.length;

  const handleSelect = (repo: SavedRepository) => {
    openRepository(repo);
    navigate(`/app/repositories/${repo.id}/explorer`);
  };

  const handleCreated = (repo: SavedRepository) => {
    setRepositories((prev) => [repo, ...prev]);
    handleSelect(repo);
  };

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && fetchRepos()}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2 sm:max-w-[240px]"
          >
            <FolderGit2 size={15} className="shrink-0 text-fg-3" />
            <span className="truncate">{displayName}</span>
            <ChevronDown size={14} className="shrink-0 text-fg-4" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-[280px]">
          <div className="flex items-center justify-between px-2.5 py-2 text-[12px] text-fg-3">
            <span className="font-medium">Repositories</span>
            <span className="tabular-nums">
              {count} / {maxLimit}
            </span>
          </div>

          <DropdownMenuSeparator />

          <div className="max-h-[200px] overflow-y-auto">
            {repositories.map((repo) => {
              const isSelected =
                activeRepo?.id === repo.id || repo.source_path === activeRepository;

              return (
                <DropdownMenuItem
                  key={repo.id}
                  onClick={() => handleSelect(repo)}
                  className={`justify-between ${
                    isSelected ? 'bg-surface-2 text-fg' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {repo.source_type === 'github' ? (
                      <GitFork size={13} className="shrink-0 text-[#9A9AA3]" />
                    ) : (
                      <HardDrive size={13} className="shrink-0 text-[#9A9AA3]" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-sans font-medium">{repo.name}</div>
                      <div className="text-[12px] text-fg-4">
                        {repo.file_count || 0} files
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="shrink-0 text-ion" />}
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={count >= maxLimit}
            onClick={() => setIsModalOpen(true)}
            className="text-ion"
          >
            <Plus size={13} />
            <span>{count >= maxLimit ? 'Limit reached (5/5)' : 'Add repository'}</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => navigate('/app')}>
            <Grid size={13} />
            <span>Manage all repositories</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddRepositoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
        currentCount={count}
        maxLimit={maxLimit}
      />
    </>
  );
};
