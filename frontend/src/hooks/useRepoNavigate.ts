import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useRepoNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeRepositoryId = useWorkspaceStore((s) => s.activeRepositoryId);

  // Extract repo ID from URL if present, otherwise fall back to store
  const match = location.pathname.match(/\/app\/repositories\/(\d+)/);
  const repoId = match ? parseInt(match[1], 10) : activeRepositoryId;

  const buildRepoUrl = (page: string) => {
    const cleanPage = page.startsWith('/') ? page.slice(1) : page;
    if (repoId != null) {
      return `/app/repositories/${repoId}/${cleanPage}`;
    }
    return '/app';
  };

  const navigateRepo = (page: string, options?: { replace?: boolean }) => {
    navigate(buildRepoUrl(page), options);
  };

  return {
    repoId,
    buildRepoUrl,
    navigateRepo,
  };
}
