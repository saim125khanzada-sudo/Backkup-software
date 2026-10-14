import React, { useState, useEffect } from "react";
import apiClient from "../api/client";
import { HardDrive, Users, FolderTree, Laptop, ShieldCheck, ArrowUpRight, UserPlus, FileUp, RefreshCw, ShieldAlert, AlertTriangle } from "lucide-react";

interface AdminStats {
  total_users: number;
  total_used_bytes: number;
  total_quota_bytes: number;
  total_files: number;
  total_devices: number;
  active_devices_24h: number;
}

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  details: any;
  created_at: string;
}

interface DashboardProps {
  onNavigate: (tab: "dashboard" | "users" | "files" | "audit" | "alerts") => void;
  onOpenCreateUser: () => void;
  onOpenBatchCsv: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenCreateUser, onOpenBatchCsv }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, logsRes, alertsRes] = await Promise.all([
        apiClient.get<AdminStats>("/admin/stats"),
        apiClient.get<AuditLog[]>("/admin/audit-logs?limit=8"),
        apiClient.get<{ unresolved_count: number }>("/admin/alerts/count").catch(() => ({ data: { unresolved_count: 0 } }))
      ]);
      setStats(statsRes.data);
      setRecentLogs(logsRes.data);
      setUnresolvedAlerts(alertsRes.data.unresolved_count);
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const usedBytes = stats?.total_used_bytes || 0;
  const quotaBytes = stats?.total_quota_bytes || 1;
  const usagePercent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

  return (
    <div className="space-y-6">
      {/* Critical Security Alert Warning Banner */}
      {unresolvedAlerts > 0 && (
        <div className="bg-red-950/70 border-2 border-red-800 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl shadow-red-950/40">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-red-900 border border-red-700 rounded-xl text-red-200">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Security Threat Intercepted on Endpoint Fleet</span>
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
                  {unresolvedAlerts} Blocked
                </span>
              </h3>
              <p className="text-xs text-red-300 mt-0.5">
                Malicious files or ransomware-encrypted uploads were automatically blocked from contaminating server storage.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate("alerts")}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition shadow-lg shrink-0 flex items-center gap-1.5"
          >
            <span>Review Security Alerts</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-800/80 border border-slate-700/80 p-6 rounded-2xl backdrop-blur-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Fleet Overview & Diagnostics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time status of 50+ enterprise client endpoints, file catalogs, and immutable storage retention.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 hover:text-white border border-slate-600 transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onOpenCreateUser}
            className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-all"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add User</span>
          </button>
          <button
            onClick={onOpenBatchCsv}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-semibold text-white border border-slate-600 transition-all"
          >
            <FileUp className="h-4 w-4" />
            <span>Bulk CSV</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Storage */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Fleet Storage</span>
            <div className="p-2 bg-sky-950/80 rounded-lg text-sky-400 border border-sky-800/60">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{formatBytes(usedBytes)}</div>
          <div className="text-xs text-slate-400 mt-1">
            of {formatBytes(quotaBytes)} provisioned quota ({usagePercent}%)
          </div>
          <div className="w-full bg-slate-700 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                usagePercent > 85 ? "bg-red-500" : usagePercent > 65 ? "bg-amber-500" : "bg-sky-500"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {/* Fleet Users */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Users</span>
            <div className="p-2 bg-emerald-950/80 rounded-lg text-emerald-400 border border-emerald-800/60">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.total_users ?? 0}</div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
            <span>Provisioned accounts</span>
            <button
              onClick={() => onNavigate("users")}
              className="text-emerald-400 hover:underline flex items-center gap-0.5"
            >
              <span>Manage</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Backed-up Files */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Master Catalog Files</span>
            <div className="p-2 bg-indigo-950/80 rounded-lg text-indigo-400 border border-indigo-800/60">
              <FolderTree className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.total_files ?? 0}</div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
            <span>With immutable versions</span>
            <button
              onClick={() => onNavigate("files")}
              className="text-indigo-400 hover:underline flex items-center gap-0.5"
            >
              <span>Browse</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Active Client Laptops */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Laptops (24h)</span>
            <div className="p-2 bg-amber-950/80 rounded-lg text-amber-400 border border-amber-800/60">
              <Laptop className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{stats?.active_devices_24h ?? 0}</div>
          <div className="text-xs text-slate-400 mt-1">
            out of {stats?.total_devices ?? 0} total enrolled endpoints
          </div>
        </div>
      </div>

      {/* Grid: Storage Architecture Alert & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Architectural Highlights */}
        <div className="lg:col-span-2 bg-slate-800/90 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span>Immutable Retention Policy Status</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-2">
              <div className="text-sm font-semibold text-slate-200">Local Client Deletions Never Delete Server Files</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                When employees delete documents or folders locally on Windows or Mac laptops, the platform flags the file record as <code className="text-amber-400 font-mono">is_deleted_locally = true</code> without deleting the physical disk file or version snapshots.
              </p>
            </div>
            <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-2">
              <div className="text-sm font-semibold text-slate-200">IT Root Superuser File Explorer</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Administrators can inspect any user directory tree, preview PDFs and media inline, restore mistakenly deleted files, or stream a consolidated <code className="text-sky-400 font-mono">.zip</code> archive on the fly without user consent.
              </p>
            </div>
          </div>

          <div className="p-4 bg-sky-950/30 border border-sky-800/60 rounded-xl flex items-center justify-between">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-white">Need to inspect files for an employee? </span>
              Switch to the File Explorer view to browse directory structures and export folders.
            </div>
            <button
              onClick={() => onNavigate("files")}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 flex-shrink-0 ml-4"
            >
              <span>Open Explorer</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right Col: Recent Activity Stream */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Fleet Activity</h2>
            <button
              onClick={() => onNavigate("audit")}
              className="text-xs text-sky-400 hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-80">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No recent audit records.</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sky-300 font-medium">{log.action}</span>
                    <span className="text-slate-500 text-[11px]">{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-400 truncate">{log.user_email || "System"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
