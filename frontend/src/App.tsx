import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MainLayout } from './layouts/MainLayout';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ToastContainer } from './components/ToastContainer';
import { useAuthStore } from './stores/authStore';

// Lazy-loaded pages for optimal initial bundle size (< 300KB)
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const RepositoryExplorer = lazy(() => import('./pages/RepositoryExplorer').then((m) => ({ default: m.RepositoryExplorer })));
const DependencyGraph = lazy(() => import('./pages/DependencyGraph').then((m) => ({ default: m.DependencyGraph })));
const ArchitectureViewer = lazy(() => import('./pages/ArchitectureViewer').then((m) => ({ default: m.ArchitectureViewer })));
const SemanticSearch = lazy(() => import('./pages/SemanticSearch').then((m) => ({ default: m.SemanticSearch })));
const AIChat = lazy(() => import('./pages/AIChat').then((m) => ({ default: m.AIChat })));
const DocumentationGenerator = lazy(() => import('./pages/DocumentationGenerator').then((m) => ({ default: m.DocumentationGenerator })));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard').then((m) => ({ default: m.HealthDashboard })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const MyRepositories = lazy(() => import('./pages/MyRepositories').then((m) => ({ default: m.MyRepositories })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

const PageFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center min-h-[200px]">
    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
      <span>Loading module...</span>
    </div>
  </div>
);

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
    <Suspense fallback={<PageFallback />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

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

          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  </Suspense>
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
