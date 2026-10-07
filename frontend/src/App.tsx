import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MainLayout } from './layouts/MainLayout';
import { Overview } from './pages/Overview';
import { RepositoryExplorer } from './pages/RepositoryExplorer';
import { DependencyGraph } from './pages/DependencyGraph';
import { ArchitectureViewer } from './pages/ArchitectureViewer';
import { SemanticSearch } from './pages/SemanticSearch';
import { AIChat } from './pages/AIChat';
import { DocumentationGenerator } from './pages/DocumentationGenerator';
import { HealthDashboard } from './pages/HealthDashboard';
import { Settings } from './pages/Settings';
import { LandingPage } from './pages/LandingPage';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { MyRepositories } from './pages/MyRepositories';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ToastContainer } from './components/ToastContainer';
import { useAuthStore } from './stores/authStore';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authEnabled, token } = useAuthStore();
  if (authEnabled && !token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Authenticated Workspace Hub */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <MyRepositories />
            </ProtectedRoute>
          }
        />

        {/* Protected Repository / Workspace Analysis Routes (Inside MainLayout) */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Direct Analysis Routes */}
          <Route
            path="/overview"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <Overview />
              </motion.div>
            }
          />
          <Route
            path="/explorer"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <RepositoryExplorer />
              </motion.div>
            }
          />
          <Route
            path="/graph"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <DependencyGraph />
              </motion.div>
            }
          />
          <Route
            path="/architecture"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <ArchitectureViewer />
              </motion.div>
            }
          />
          <Route
            path="/search"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <SemanticSearch />
              </motion.div>
            }
          />
          <Route
            path="/chat"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <AIChat />
              </motion.div>
            }
          />
          <Route
            path="/documentation"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <DocumentationGenerator />
              </motion.div>
            }
          />
          <Route
            path="/health-dashboard"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <HealthDashboard />
              </motion.div>
            }
          />
          <Route
            path="/settings"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <Settings />
              </motion.div>
            }
          />

          {/* Scoped Repository Routes: /app/repositories/:repositoryId/* */}
          <Route
            path="/app/repositories/:repositoryId"
            element={<Navigate to="explorer" replace />}
          />
          <Route
            path="/app/repositories/:repositoryId/overview"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <Overview />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/explorer"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <RepositoryExplorer />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/graph"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <DependencyGraph />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/architecture"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <ArchitectureViewer />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/search"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <SemanticSearch />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/chat"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <AIChat />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/documentation"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <DocumentationGenerator />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/health-dashboard"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <HealthDashboard />
              </motion.div>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/settings"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <Settings />
              </motion.div>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const { checkAuthStatus } = useAuthStore();

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return (
    <BrowserRouter>
      <AnimatedBackground />
      <AnimatedRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
