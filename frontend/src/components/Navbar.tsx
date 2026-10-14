import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import { HardDrive, Users, FolderTree, ShieldCheck, LogOut, Activity, ShieldAlert } from "lucide-react";

interface NavbarProps {
  currentTab: "dashboard" | "users" | "files" | "audit" | "alerts";
  onTabChange: (tab: "dashboard" | "users" | "files" | "audit" | "alerts") => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuth();
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<number>(0);

  const checkAlerts = async () => {
    try {
      const res = await apiClient.get<{ unresolved_count: number }>("/admin/alerts/count");
      setUnresolvedAlerts(res.data.unresolved_count);
    } catch {
      // Ignore background poll errors
    }
  };

  useEffect(() => {
    checkAlerts();
    const interval = setInterval(checkAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange("dashboard")}>
            <div className="h-10 w-10 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-lg shadow-sky-600/30">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-lg text-white leading-tight flex items-center gap-2">
                <span>Enterprise Backup & Sync</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800 font-semibold">
                  Admin Root
                </span>
              </div>
              <p className="text-xs text-slate-400">Endpoint Fleet Guardian</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex space-x-1">
            <button
              onClick={() => onTabChange("dashboard")}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === "dashboard"
                  ? "bg-slate-900 text-sky-400 border border-slate-700"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onTabChange("users")}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === "users"
                  ? "bg-slate-900 text-sky-400 border border-slate-700"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Fleet Users</span>
            </button>

            <button
              onClick={() => onTabChange("files")}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === "files"
                  ? "bg-slate-900 text-sky-400 border border-slate-700"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <FolderTree className="h-4 w-4" />
              <span>File Explorer</span>
            </button>

            <button
              onClick={() => onTabChange("alerts")}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                currentTab === "alerts"
                  ? "bg-slate-900 text-red-400 border border-slate-700"
                  : unresolvedAlerts > 0
                  ? "text-red-400 hover:bg-red-950/40"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Security Alerts</span>
              {unresolvedAlerts > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-bold animate-pulse">
                  {unresolvedAlerts}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange("audit")}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === "audit"
                  ? "bg-slate-900 text-sky-400 border border-slate-700"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Audit Logs</span>
            </button>
          </nav>

          {/* User profile & Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-slate-200">{user?.full_name || user?.email}</div>
              <div className="text-xs text-sky-400 font-mono">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-md bg-slate-700/60 hover:bg-red-950/40 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
