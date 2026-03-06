"use client";

import { useState, useCallback } from "react";
import { Upload, FileUp, Zap, Loader2 } from "lucide-react";
import {
  uploadDataset,
  runAnalysis,
  getResults,
  getRobotModel,
} from "@/lib/api";
import type { AnalysisResult, RobotModelData } from "@/lib/api";

interface Props {
  onAnalysisComplete: (r: AnalysisResult, m: RobotModelData) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export function UploadPanel({ onAnalysisComplete, loading, setLoading }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        setStep("Uploading dataset...");
        const uploadRes = await uploadDataset(file);
        setUploadedFile(uploadRes.filename);
        setUploadInfo(`${uploadRes.rows.toLocaleString()} rows, ${uploadRes.columns.length} columns`);

        setStep("Running ML pipeline...");
        await runAnalysis();

        setStep("Loading results...");
        const [results, model] = await Promise.all([
          getResults(),
          getRobotModel(),
        ]);

        onAnalysisComplete(results, model);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        setLoading(false);
        setStep("");
      }
    },
    [onAnalysisComplete, setLoading]
  );

  const handleDemoRun = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setStep("Running analysis on example dataset...");
      await runAnalysis(true);

      setStep("Loading results...");
      const [results, model] = await Promise.all([
        getResults(),
        getRobotModel(),
      ]);

      onAnalysisComplete(results, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
      setStep("");
    }
  }, [onAnalysisComplete, setLoading]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file?.name.endsWith(".csv")) handleFile(file);
      else setError("Please upload a .csv file");
    },
    [handleFile]
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`w-full max-w-md border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
          dragActive
            ? "border-blue-500 bg-blue-500/5"
            : "border-zinc-700 hover:border-zinc-500"
        }`}
        onClick={() => {
          if (loading) return;
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv";
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-sm text-blue-400">{step}</p>
          </div>
        ) : (
          <>
            <FileUp className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-300 mb-1">
              Drop your sensor CSV here, or click to browse
            </p>
            <p className="text-xs text-zinc-500">
              Expected columns: name/joint_id, time/timestamp, magX/mx, magY/my, magZ/mz
            </p>
          </>
        )}
      </div>

      {uploadedFile && (
        <p className="text-xs text-zinc-400">
          Uploaded: <span className="text-zinc-200">{uploadedFile}</span>{" "}
          {uploadInfo && <span className="text-zinc-500">({uploadInfo})</span>}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
          {error}
        </p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 w-full max-w-md">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs text-zinc-600">or</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Demo button */}
      <button
        onClick={handleDemoRun}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
      >
        <Zap className="w-4 h-4" />
        Run Demo Analysis
      </button>
      <p className="text-[10px] text-zinc-600">
        Uses the bundled 15K-row magnetometer dataset
      </p>
    </div>
  );
}
