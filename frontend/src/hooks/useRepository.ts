import { useState, useEffect } from 'react';
import { RepositoryInfo, FileInfo, FileTreeNode } from '../types/repository';
import { scanRepository, listFiles, getFile } from '../services/repository';

export function useRepository() {
  const [repoPath, setRepoPath] = useState<string>(() => localStorage.getItem('repo_path') || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepositoryInfo | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileDetail, setSelectedFileDetail] = useState<{
    content: string;
    language: string;
    entities: any[];
  } | null>(null);
  const [fileLoading, setFileLoading] = useState<boolean>(false);

  // Parse flat file list into hierarchical tree
  const buildTree = (fileList: FileInfo[], rootPath: string): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const rootPathNormalized = rootPath.replace(/[\\\/]+$/, '');

    fileList.forEach((file) => {
      // Calculate relative path to repo root
      let relativePath = file.path;
      if (relativePath.startsWith(rootPathNormalized)) {
        relativePath = relativePath.slice(rootPathNormalized.length).replace(/^[\\\/]+/, '');
      }

      const segments = relativePath.split(/[\\\/]+/);
      let currentLevel = root;
      let accumulatedPath = rootPathNormalized;

      segments.forEach((segment, idx) => {
        if (!segment) return;
        
        accumulatedPath += '/' + segment;
        const isFile = idx === segments.length - 1;
        let existingNode = currentLevel.find((node) => node.name === segment);

        if (!existingNode) {
          existingNode = {
            name: segment,
            path: isFile ? file.path : accumulatedPath,
            type: isFile ? 'file' : 'directory',
            extension: isFile ? file.extension : undefined,
          };
          if (!isFile) {
            existingNode.children = [];
          }
          currentLevel.push(existingNode);
        }

        if (!isFile && existingNode.children) {
          currentLevel = existingNode.children;
        }
      });
    });

    // Helper to sort directories before files
    const sortTree = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((node) => {
        if (node.children) sortTree(node.children);
      });
    };

    sortTree(root);
    return root;
  };

  const handleScan = async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const info = await scanRepository(path);
      setRepoInfo(info);
      setRepoPath(path);
      localStorage.setItem('repo_path', path);

      const fileList = await listFiles(path);
      setFiles(fileList);
      setFileTree(buildTree(fileList, path));
    } catch (err: any) {
      setError(err.message || 'Failed to scan repository.');
    } finally {
      setLoading(false);
    }
  };

  // Select a directory using native Electron dialog if available
  const selectLocalDirectory = async () => {
    // Check if we are running inside Electron
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      try {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
          handleScan(path);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to select directory.');
      }
    } else {
      setError('Directory selector is only available in the desktop application.');
    }
  };

  // Load individual file content
  useEffect(() => {
    if (!selectedFilePath) {
      setSelectedFileDetail(null);
      return;
    }

    const loadFile = async () => {
      setFileLoading(true);
      setError(null);
      try {
        const detail = await getFile(selectedFilePath);
        setSelectedFileDetail({
          content: detail.content,
          language: detail.language,
          entities: detail.entities,
        });
      } catch (err: any) {
        setError(`Failed to read file: ${err.message}`);
      } finally {
        setFileLoading(false);
      }
    };

    loadFile();
  }, [selectedFilePath]);

  // Load existing repo on startup if stored
  useEffect(() => {
    const savedPath = localStorage.getItem('repo_path');
    if (savedPath) {
      handleScan(savedPath);
    }
  }, []);

  return {
    repoPath,
    loading,
    error,
    repoInfo,
    files,
    fileTree,
    selectedFilePath,
    setSelectedFilePath,
    selectedFileDetail,
    fileLoading,
    handleScan,
    selectLocalDirectory,
  };
}
