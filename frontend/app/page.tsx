"use client";

import { useState, useCallback } from "react";
import { Dashboard } from "@/components/Dashboard";
import type { AnalysisResult, RobotModelData, DiagnosticsResult } from "@/lib/api";
import { getDiagnostics } from "@/lib/api";

export default function Home() {
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [robotModel, setRobotModel] = useState<RobotModelData | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalysisComplete = useCallback(
    (r: AnalysisResult, m: RobotModelData) => {
      setResults(r);
      setRobotModel(m);
      getDiagnostics()
        .then(setDiagnostics)
        .catch(() => setDiagnostics(null));
    },
    []
  );

  return (
    <Dashboard
      results={results}
      robotModel={robotModel}
      diagnostics={diagnostics}
      onAnalysisComplete={handleAnalysisComplete}
      loading={loading}
      setLoading={setLoading}
    />
  );
}
