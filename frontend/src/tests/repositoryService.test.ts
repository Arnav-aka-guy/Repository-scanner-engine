import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../services/api';
import { getFile, scanUserRepository, listFiles } from '../services/repository';

describe('Repository Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getFile requires repo_path and calls apiGet with both file and repo', async () => {
    const apiGetSpy = vi.spyOn(api, 'apiGet').mockResolvedValue({
      file_path: 'backend/main.py',
      content: 'print("hello")',
      language: 'Python',
      entities: [],
    });

    const result = await getFile('backend/main.py', '/mock/repo/root');
    expect(apiGetSpy).toHaveBeenCalledWith('/repository/file/backend/main.py', {
      repo_path: '/mock/repo/root',
    });
    expect(result.file_path).toBe('backend/main.py');
  });

  it('scanUserRepository starts a background scan for a saved repository', async () => {
    const apiPostSpy = vi.spyOn(api, 'apiPost').mockResolvedValue({
      job_id: 'job-1',
      status: 'pending',
      message: 'Scan queued.',
      repository_id: 7,
    });

    const result = await scanUserRepository(7);
    expect(apiPostSpy).toHaveBeenCalledWith('/repositories/7/scan', {});
    expect(result.job_id).toBe('job-1');
  });

  it('listFiles queries files for specific repository', async () => {
    const apiGetSpy = vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    await listFiles('/mock/repo');
    expect(apiGetSpy).toHaveBeenCalledWith('/repository/files', {
      repo_path: '/mock/repo',
    });
  });
});
