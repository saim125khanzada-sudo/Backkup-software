import React, { useState, useEffect } from "react";
import apiClient from "../api/client";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Clock,
  Laptop,
  User as UserIcon,
  Folder,
  File,
  RefreshCw,
  Eye,
  X,
  ShieldCheck,
  Ban
} from "lucide-react";

export interface SecurityAlert {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  device_id: string | null;
  device_name: string | null;
  device_os: string | null;
  file_name: string;
  folder_path: string;
  threat_type: string;
  severity: string;
  details: any;
  status: "UNRESOLVED" | "ACKNOWLEDGED" | "RESOLVED";
  created_at: string;
}

export const SecurityAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("UNRESOLVED");
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SecurityAlert[]>("/admin/alerts", {
        params: { status: statusFilter }
      });
      setAlerts(res.data);
    } catch (err) {
      console.error("Failed to fetch security alerts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter]);

  const handleAcknowledge = async (alertId: string) => {
    setActionLoading(alertId);
    try {
      await apiClient.post(`/admin/alerts/${alertId}/acknowledge`);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "ACKNOWLEDGED" } : a))
      );
      if (selectedAlert && selectedAlert.id === alertId) {
        setSelectedAlert({ ...selectedAlert, status: "ACKNOWLEDGED" });
      }
    } catch (err) {
      console.error("Failed to acknowledge alert", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (alertId: string) => {
    setActionLoading(alertId);
    try {
      await apiClient.post(`/admin/alerts/${alertId}/resolve`);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "RESOLVED" } : a))
      );
      if (selectedAlert && selectedAlert.id === alertId) {
        setSelectedAlert({ ...selectedAlert, status: "RESOLVED" });
      }
    } catch (err) {
      console.error("Failed to resolve alert", err);
    } finally {
      setActionLoading(null);
    }
  };

  const unresolvedCount = alerts.filter((a) => a.status === "UNRESOLVED").length;
  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-lg bg-red-950/60 border border-red-800 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </span>
            <span>Anti-Ransomware & Threat Protection</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time heuristic and signature defense preventing malicious files from contaminating backup storage.
          </p>
        </div>

        <button
          onClick={fetchAlerts}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium border border-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-red-900/40 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Unresolved Threats</p>
              <p className="text-3xl font-extrabold text-red-400 mt-1">{unresolvedCount}</p>
            </div>
            <div className="p-3 bg-red-950/70 border border-red-800 rounded-xl text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-red-400/80">
            <span>{unresolvedCount > 0 ? "Immediate administrator review recommended" : "All clear"}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Blocked Uploads</p>
              <p className="text-3xl font-extrabold text-white mt-1">{alerts.length}</p>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-sky-400">
              <Ban className="w-6 h-6" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Zero-loss quarantine policy enforced</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Defense Status</p>
              <p className="text-xl font-bold text-emerald-400 mt-2 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Active & Guarding</span>
              </p>
            </div>
            <div className="p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Entropy + Header + Signature Heuristics</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3">
        {[
          { key: "UNRESOLVED", label: "Unresolved Alerts" },
          { key: "ACKNOWLEDGED", label: "Acknowledged" },
          { key: "RESOLVED", label: "Resolved" },
          { key: "ALL", label: "All Incidents" }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statusFilter === tab.key
                ? "bg-slate-800 text-sky-400 border border-slate-700 shadow"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span>Scanning incident logs...</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500/80 mb-3" />
            <h3 className="text-lg font-semibold text-white">No Threat Incidents Detected</h3>
            <p className="text-sm text-slate-500 mt-1">
              No malicious files or ransomware encryption attempts found for this filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Threat Detected</th>
                  <th className="px-6 py-4">User & Endpoint</th>
                  <th className="px-6 py-4">Folder & File Name</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-md bg-red-950/80 border border-red-800 text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="font-semibold text-red-400 font-mono text-xs">{a.threat_type}</div>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[10px]">
                            {a.severity}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-white flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{a.user_name || a.user_email || "Unknown User"}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-slate-500" />
                        <span>{a.device_name || "Endpoint"} ({a.device_os || "os"})</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-white font-mono flex items-center gap-1.5">
                        <File className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="truncate max-w-[200px]" title={a.file_name}>{a.file_name}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[220px]" title={a.folder_path}>{a.folder_path}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {a.status === "UNRESOLVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950 text-red-400 border border-red-800">
                          UNRESOLVED
                        </span>
                      )}
                      {a.status === "ACKNOWLEDGED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
                          ACKNOWLEDGED
                        </span>
                      )}
                      {a.status === "RESOLVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          RESOLVED
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => setSelectedAlert(a)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>

                      {a.status === "UNRESOLVED" && (
                        <button
                          disabled={actionLoading === a.id}
                          onClick={() => handleAcknowledge(a.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-300 text-xs font-medium border border-amber-800 transition"
                        >
                          Acknowledge
                        </button>
                      )}

                      {a.status !== "RESOLVED" && (
                        <button
                          disabled={actionLoading === a.id}
                          onClick={() => handleResolve(a.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-xs font-medium border border-emerald-800 transition"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forensic Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedAlert(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <span className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-400">
                <ShieldAlert className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Forensic Threat Diagnosis</h2>
                <p className="text-xs text-red-400 font-mono">{selectedAlert.threat_type}</p>
              </div>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Target File:</span>
                  <span className="text-white font-mono font-bold">{selectedAlert.file_name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Folder Path:</span>
                  <span className="text-slate-300 font-mono">{selectedAlert.folder_path}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Employee Account:</span>
                  <span className="text-sky-400 font-mono">{selectedAlert.user_email || "N/A"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Endpoint Device:</span>
                  <span className="text-slate-300 font-mono">{selectedAlert.device_name || "N/A"} ({selectedAlert.device_os})</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Interception Time:</span>
                  <span className="text-slate-300">{new Date(selectedAlert.created_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Current Status:</span>
                  <span className="text-red-400 font-bold">{selectedAlert.status}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  Technical Diagnosis & Detection Metadata:
                </p>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-48">
                  {JSON.stringify(selectedAlert.details || {}, null, 2)}
                </pre>
              </div>

              <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-xs text-red-300">
                <strong>Enforcement Action:</strong> This file upload was strictly terminated. The malicious content was unlinked and purged from temporary memory, preventing infection of backup storage or version history.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              {selectedAlert.status === "UNRESOLVED" && (
                <button
                  onClick={() => handleAcknowledge(selectedAlert.id)}
                  className="px-4 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-300 text-sm font-semibold border border-amber-800 transition"
                >
                  Acknowledge Incident
                </button>
              )}
              {selectedAlert.status !== "RESOLVED" && (
                <button
                  onClick={() => handleResolve(selectedAlert.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
                >
                  Mark as Resolved
                </button>
              )}
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
