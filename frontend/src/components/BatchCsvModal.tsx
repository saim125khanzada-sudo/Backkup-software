import React, { useState } from "react";
import apiClient from "../api/client";
import { X, FileUp, Download, AlertCircle, CheckCircle2, ListOrdered } from "lucide-react";

interface BatchCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersImported: () => void;
}

export const BatchCsvModal: React.FC<BatchCsvModalProps> = ({ isOpen, onClose, onUsersImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total_processed: number;
    created_count: number;
    errors: string[];
  } | null>(null);

  if (!isOpen) return null;

  const downloadSampleCsv = () => {
    const csvContent =
      "email,password,name,quota_gb\n" +
      "john.doe@company.com,TempPass2026!,John Doe,50\n" +
      "sarah.smith@company.com,TempPass2026!,Sarah Smith,100\n" +
      "finance.lead@company.com,TempPass2026!,Finance Lead,75\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "bulk_users_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiClient.post("/admin/users/batch-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      if (res.data.created_count > 0) {
        onUsersImported();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to process CSV file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <div className="flex items-center space-x-2 text-white font-semibold">
            <FileUp className="h-5 w-5 text-sky-400" />
            <span>Bulk User Provisioning (CSV)</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-between">
            <div className="text-xs text-slate-300">
              <p className="font-semibold text-slate-200">Required CSV Columns:</p>
              <code className="text-sky-400 font-mono">email,password,name,quota_gb</code>
            </div>
            <button
              onClick={downloadSampleCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium text-sky-300 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Template</span>
            </button>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-900/40">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="csvFileInput"
              />
              <label htmlFor="csvFileInput" className="cursor-pointer flex flex-col items-center">
                <FileUp className="h-10 w-10 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-200">
                  {file ? file.name : "Click to select CSV file"}
                </span>
                <span className="text-xs text-slate-400 mt-1">UTF-8 formatted .csv files up to 10MB</span>
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg flex items-center space-x-2 text-red-300 text-sm">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Processed: {result.total_processed}</span>
                  <span className="text-emerald-400 flex items-center space-x-1 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Created: {result.created_count}</span>
                  </span>
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-900/60 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                    <p className="font-semibold flex items-center space-x-1">
                      <ListOrdered className="h-3.5 w-3.5" />
                      <span>Errors ({result.errors.length}):</span>
                    </p>
                    {result.errors.map((err, i) => (
                      <p key={i}>• {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-300 transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={!file || loading}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? <span>Importing...</span> : <span>Upload & Provision</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
