"use client";

import { useState, useCallback } from "react";
import { Upload, FileUp, Zap, Loader2, Wrench, ArrowRight } from "lucide-react";
import {
  uploadDataset,
  runAnalysis,
  pollUntilDone,
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

        setStep("Starting ML pipeline...");
        await runAnalysis();

        setStep("Running ML pipeline...");
        await pollUntilDone((msg) => setStep(msg));

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
      setStep("Starting analysis on example dataset...");
      await runAnalysis(true);

      setStep("Running ML pipeline...");
      await pollUntilDone((msg) => setStep(msg));

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
    <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-6 animate-fade-in">
      {/* Hero text */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-600 to-lime-400 flex items-center justify-center shadow-lg shadow-lime-500/20 animate-float">
            <Wrench className="w-5 h-5 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-100 mb-1.5">
          Start Your Analysis
        </h2>
        <p className="text-[13px] text-zinc-500">
          Upload robot sensor data to detect wear and optimize maintenance
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`w-full max-w-sm border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer group ${
          dragActive
            ? "border-lime-500 bg-lime-500/5 shadow-lg shadow-lime-500/10"
            : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/50"
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
            <Loader2 className="w-8 h-8 text-lime-400 animate-spin" />
            <p className="text-sm text-lime-300 font-medium">{step}</p>
              <div className="w-32 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-lime-500 rounded-full animate-shimmer" style={{ width: "60%" }} />
            </div>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto mb-3 group-hover:bg-zinc-700/80 transition-colors">
              <FileUp className="w-5 h-5 text-zinc-400 group-hover:text-zinc-300 transition-colors" />
            </div>
            <p className="text-sm text-zinc-300 font-medium mb-1">
              Drop your sensor CSV here
            </p>
            <p className="text-[11px] text-zinc-600">
              or click to browse files
            </p>
          </>
        )}
      </div>

      {uploadedFile && (
        <p className="text-xs text-zinc-400">
          Uploaded: <span className="text-zinc-200 font-medium">{uploadedFile}</span>{" "}
          {uploadInfo && <span className="text-zinc-600">({uploadInfo})</span>}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/8 px-4 py-2 rounded-xl border border-red-500/15 max-w-sm text-center">
          {error}
        </p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 w-full max-w-sm">
        <div className="flex-1 h-px bg-zinc-800/60" />
        <span className="text-[10px] text-zinc-700 font-medium uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </div>

      {/* Demo button */}
      <button
        onClick={handleDemoRun}
        disabled={loading}
        className="group flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-lime-600 to-lime-400 hover:from-lime-500 hover:to-lime-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-zinc-900 transition-all shadow-lg shadow-lime-500/20 hover:shadow-lime-500/30"
      >
        <Zap className="w-4 h-4" />
        Run Demo Analysis
        <ArrowRight className="w-3.5 h-3.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
      </button>
      <p className="text-[10px] text-zinc-700">
        Uses the bundled 15K-row magnetometer dataset
      </p>
    </div>
  );
}
