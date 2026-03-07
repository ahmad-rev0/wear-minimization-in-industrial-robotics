"use client";

import { useState, useCallback } from "react";
import type { AnalysisResult, RobotModelData, DiagnosticsResult } from "@/lib/api";
import {
  getResults,
  getRobotModel,
  getDiagnostics,
  runAnalysis as apiRunAnalysis,
  pollUntilDone as apiPollUntilDone,
} from "@/lib/api";

interface UseAnalysisOptions {
  onComplete?: (results: AnalysisResult, model: RobotModelData) => void;
  onDiagnosticsUpdate?: (diagnostics: DiagnosticsResult) => void;
}

interface UseAnalysisReturn {
  results: AnalysisResult | null;
  robotModel: RobotModelData | null;
  diagnostics: DiagnosticsResult | null;
  loading: boolean;
  error: string | null;
  currentStep: string;
  runAnalysis: (useDemo?: boolean) => Promise<void>;
  reset: () => void;
  refreshDiagnostics: () => Promise<void>;
  refreshModel: () => Promise<void>;
  checkAndRunAnalysis: () => Promise<boolean>;
  loadFromUpload: (results: AnalysisResult, model: RobotModelData) => void;
}

export function useAnalysis({
  onComplete,
  onDiagnosticsUpdate,
}: UseAnalysisOptions = {}): UseAnalysisReturn {
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [robotModel, setRobotModel] = useState<RobotModelData | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");

  const runAnalysis = useCallback(
    async (useDemo: boolean = false) => {
      setLoading(true);
      setError(null);
      setCurrentStep("Starting analysis...");

      try {
        setCurrentStep("Running ML pipeline...");
        await apiRunAnalysis(useDemo);

        setCurrentStep("Processing data...");
        await apiPollUntilDone((msg) => setCurrentStep(msg));

        setCurrentStep("Loading results...");
        const [resultsData, modelData, diagnosticsData] = await Promise.all([
          getResults(),
          getRobotModel(),
          getDiagnostics().catch(() => null),
        ]);

        setResults(resultsData);
        setRobotModel(modelData);
        setDiagnostics(diagnosticsData);
        setCurrentStep("Complete");

        onComplete?.(resultsData, modelData);
        if (diagnosticsData) onDiagnosticsUpdate?.(diagnosticsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        setError(message);
        setCurrentStep(`Error: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [onComplete, onDiagnosticsUpdate],
  );

  const fetchDiagnosticsWithRetry = useCallback(
    async (retries = 3, delayMs = 1500) => {
      for (let i = 0; i < retries; i++) {
        try {
          const d = await getDiagnostics();
          setDiagnostics(d);
          onDiagnosticsUpdate?.(d);
          return;
        } catch {
          if (i < retries - 1) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }
    },
    [onDiagnosticsUpdate],
  );

  const checkAndRunAnalysis = useCallback(async (): Promise<boolean> => {
    try {
      const resultsData = await getResults();
      const modelData = await getRobotModel();
      setResults(resultsData);
      setRobotModel(modelData);
      fetchDiagnosticsWithRetry();
      return false;
    } catch {
      return false;
    }
  }, [fetchDiagnosticsWithRetry]);

  const refreshDiagnostics = useCallback(async () => {
    try {
      const diagnosticsData = await getDiagnostics();
      setDiagnostics(diagnosticsData);
      onDiagnosticsUpdate?.(diagnosticsData);
    } catch (err) {
      console.error("Failed to refresh diagnostics:", err);
    }
  }, [onDiagnosticsUpdate]);

  const refreshModel = useCallback(async () => {
    try {
      const modelData = await getRobotModel();
      setRobotModel(modelData);
    } catch (err) {
      console.error("Failed to refresh robot model:", err);
    }
  }, []);

  const loadFromUpload = useCallback(
    (r: AnalysisResult, m: RobotModelData) => {
      setResults(r);
      setRobotModel(m);
      setError(null);
      setCurrentStep("Complete");
      fetchDiagnosticsWithRetry();
    },
    [fetchDiagnosticsWithRetry],
  );

  const reset = useCallback(() => {
    setResults(null);
    setRobotModel(null);
    setDiagnostics(null);
    setLoading(false);
    setError(null);
    setCurrentStep("");
  }, []);

  return {
    results,
    robotModel,
    diagnostics,
    loading,
    error,
    currentStep,
    runAnalysis,
    reset,
    refreshDiagnostics,
    refreshModel,
    checkAndRunAnalysis,
    loadFromUpload,
  };
}