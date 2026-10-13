import React, { useState, useEffect } from "react";
import apiClient from "../api/client";
import { ShieldCheck, Search, Filter, RefreshCw, Calendar, User, Tag, Code } from "lucide-react";

interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  details: any;
  created_at: string;
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<AuditLog[]>("/admin/audit-logs", {
        params: {
          limit: 100,
          action: actionFilter || undefined,
        },
      });
      setLogs(res.data);
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const actionTypes = [
    "",
    "AUTH_LOGIN",
    "CLIENT_HANDSHAKE",
    "FILE_CREATED",
    "FILE_UPDATED",
    "FILE_DELETED_LOCALLY",
    "ADMIN_FILE_RESTORED",
    "ADMIN_FILE_DOWNLOAD",
    "ADMIN_EXPORT_ZIP",
    "ADMIN_USER_CREATED",
    "ADMIN_BATCH_USERS_CSV",
    "ADMIN_USER_UPDATED",
    "ADMIN_USER_DEACTIVATED",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-600 rounded-xl text-white shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">System Audit & Compliance Log</h1>
            <p className="text-xs text-slate-400">
              Immutable event log tracking client handshakes, uploads, local deletions, and admin forensic actions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
          >
            <option value="">All Action Types</option>
            {actionTypes.filter(Boolean).map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <button
            onClick={fetchLogs}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Refresh Logs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Action</th>
                <th className="px-6 py-3.5">User / Initiator</th>
                <th className="px-6 py-3.5">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 font-mono text-xs">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    No audit records found matching criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <tr key={log.id} className="hover:bg-slate-750/50 transition-colors">
                      {/* Timestamp */}
                      <td className="px-6 py-3.5 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>

                      {/* Action */}
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            log.action.includes("DELETED")
                              ? "bg-amber-950/80 text-amber-300 border-amber-800"
                              : log.action.includes("CREATED") || log.action.includes("UPLOAD")
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                              : log.action.includes("RESTORED")
                              ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                              : "bg-slate-900 text-sky-400 border-slate-700"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* User */}
                      <td className="px-6 py-3.5 text-slate-300 whitespace-nowrap">
                        {log.user_email || "System"}
                      </td>

                      {/* Details */}
                      <td className="px-6 py-3.5 text-slate-400">
                        {log.details ? (
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="truncate max-w-md text-slate-300">
                                {JSON.stringify(log.details).slice(0, 80)}...
                              </span>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                className="text-sky-400 hover:underline text-[10px]"
                              >
                                {isExpanded ? "Collapse" : "JSON"}
                              </button>
                            </div>
                            {isExpanded && (
                              <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-[11px] overflow-auto max-h-48 whitespace-pre-wrap select-text">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
