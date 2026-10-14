import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { Login } from "./pages/Login";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { UsersManager } from "./pages/UsersManager";
import { FileExplorer } from "./pages/FileExplorer";
import { AuditLogs } from "./pages/AuditLogs";
import { SecurityAlerts } from "./pages/SecurityAlerts";
import { CreateUserModal } from "./components/CreateUserModal";
import { BatchCsvModal } from "./components/BatchCsvModal";
import { EditUserModal } from "./components/EditUserModal";
import { User } from "./context/AuthContext";

export const App: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<"dashboard" | "users" | "files" | "audit" | "alerts">("dashboard");

  // Global modals
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isBatchCsvOpen, setIsBatchCsvOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Cross-page navigation state
  const [targetUserForFiles, setTargetUserForFiles] = useState<User | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Connecting to endpoint security service...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const handleInspectFiles = (user: User) => {
    setTargetUserForFiles(user);
    setCurrentTab("files");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-sky-500 selection:text-white">
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === "dashboard" && (
          <Dashboard
            onNavigate={setCurrentTab}
            onOpenCreateUser={() => setIsCreateUserOpen(true)}
            onOpenBatchCsv={() => setIsBatchCsvOpen(true)}
          />
        )}

        {currentTab === "users" && (
          <UsersManager
            onInspectFiles={handleInspectFiles}
            onOpenCreateUser={() => setIsCreateUserOpen(true)}
            onOpenBatchCsv={() => setIsBatchCsvOpen(true)}
            onOpenEditUser={(u) => setEditingUser(u)}
          />
        )}

        {currentTab === "files" && <FileExplorer initialUser={targetUserForFiles} />}

        {currentTab === "alerts" && <SecurityAlerts />}

        {currentTab === "audit" && <AuditLogs />}
      </main>

      {/* Global Modals */}
      <CreateUserModal
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
        onUserCreated={() => {}}
      />

      <BatchCsvModal
        isOpen={isBatchCsvOpen}
        onClose={() => setIsBatchCsvOpen(false)}
        onUsersImported={() => {}}
      />

      <EditUserModal
        user={editingUser}
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        onUserUpdated={() => {}}
      />
    </div>
  );
};
