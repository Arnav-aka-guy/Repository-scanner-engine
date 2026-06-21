import { useState, useCallback } from 'react';
import { getDependencyGraph, getCallGraph, getAnalysis } from '../services/graph';
import { AnalysisResult } from '../types/graph';

export function useGraph() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [graphType, setGraphType] = useState<'dependency' | 'call'>('dependency');

  const fetchGraph = useCallback(async (repoPath: string, type: 'dependency' | 'call') => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    setGraphType(type);
    try {
      let data;
      if (type === 'dependency') {
        data = await getDependencyGraph(repoPath);
      } else {
        data = await getCallGraph(repoPath);
      }
      setGraphData(data);
    } catch (err: any) {
      setError(err.message || `Failed to fetch ${type} graph.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async (repoPath: string) => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalysis(repoPath);
      setAnalysisResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze repository graph.');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    graphData,
    analysisResult,
    graphType,
    fetchGraph,
    runAnalysis,
  };
}
