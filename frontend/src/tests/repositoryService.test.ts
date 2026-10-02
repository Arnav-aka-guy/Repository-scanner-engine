import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../services/api';
import { getFile, scanRepository, listFiles } from '../services/repository';

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

  it('scanRepository calls apiPost with path and returns repo info', async () => {
    const mockRepoInfo = {
      path: '/mock/repo',
      name: 'repo',
      total_files: 10,
      total_lines: 500,
      languages: { Python: 10 },
      scanned_at: '2026-10-02T00:00:00Z',
    };
    const apiPostSpy = vi.spyOn(api, 'apiPost').mockResolvedValue(mockRepoInfo);

    const result = await scanRepository('/mock/repo');
    expect(apiPostSpy).toHaveBeenCalledWith('/repository/scan', {
      path: '/mock/repo',
    });
    expect(result.total_files).toBe(10);
  });

  it('listFiles queries files for specific repository', async () => {
    const apiGetSpy = vi.spyOn(api, 'apiGet').mockResolvedValue([]);
    await listFiles('/mock/repo');
    expect(apiGetSpy).toHaveBeenCalledWith('/repository/files', {
      repo_path: '/mock/repo',
    });
  });
});
