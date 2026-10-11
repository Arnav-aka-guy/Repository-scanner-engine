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
  const { activeRepository, scanRepo } = useWorkspaceStore();
  const [repositories, setRepositories] = useState<SavedRepository[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const activeRepo = repositories.find(
    (r) =>
      r.source_path === activeRepository ||
      r.source_path.replace(/\\/g, '/').replace(/\/+$/, '') ===
        (activeRepository || '').replace(/\\/g, '/').replace(/\/+$/, '')
  );

  const displayName =
    activeRepo?.name ||
    (activeRepository ? activeRepository.split(/[\\/]/).pop() : 'Select Repository');
  const count = repositories.length;
  const maxLimit = 5;

  const handleSelect = (repo: SavedRepository) => {
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
    <>
      <DropdownMenu onOpenChange={(open) => open && fetchRepos()}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex max-w-[260px] items-center gap-2 rounded-[4px] border border-[#262B28] bg-[#1C201D] px-2.5 py-1 text-[12px] font-sans font-medium text-[#E9ECE6] transition-colors hover:border-[#F2A93B] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F2A93B]"
          >
            <FolderGit2 size={13} className="shrink-0 text-[#F2A93B]" />
            <span className="truncate">{displayName}</span>
            <ChevronDown size={12} className="shrink-0 text-[#8A928B]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-[280px]">
          <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-[#8A928B]">
            <span className="font-mono uppercase tracking-wider text-[10px] font-semibold">
              Repositories
            </span>
            <span className="font-mono text-[10px] text-[#E9ECE6]">
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
                    isSelected ? 'bg-[#1C201D] text-[#F2A93B]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {repo.source_type === 'github' ? (
                      <GitFork size={13} className="shrink-0 text-[#8A928B]" />
                    ) : (
                      <HardDrive size={13} className="shrink-0 text-[#8A928B]" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-sans font-medium">{repo.name}</div>
                      <div className="font-mono text-[10px] text-[#8A928B]">
                        {repo.file_count || 0} files
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check size={13} className="shrink-0 text-[#F2A93B]" />}
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={count >= maxLimit}
            onClick={() => setIsModalOpen(true)}
            className="text-[#F2A93B]"
          >
            <Plus size={13} />
            <span>{count >= maxLimit ? 'Limit reached (5/5)' : 'Add Repository...'}</span>
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
