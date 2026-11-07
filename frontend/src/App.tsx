import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ToastContainer } from './components/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuthStore } from './stores/authStore';
import { useWorkspaceStore } from './stores/workspaceStore';

// Lazy-loaded pages for optimal initial bundle size (< 300KB)
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const RepositoryExplorer = lazy(() => import('./pages/RepositoryExplorer').then((m) => ({ default: m.RepositoryExplorer })));
const DependencyGraph = lazy(() => import('./pages/DependencyGraph').then((m) => ({ default: m.DependencyGraph })));
const ArchitectureViewer = lazy(() => import('./pages/ArchitectureViewer').then((m) => ({ default: m.ArchitectureViewer })));
const SemanticSearch = lazy(() => import('./pages/SemanticSearch').then((m) => ({ default: m.SemanticSearch })));
const AIChat = lazy(() => import('./pages/AIChat').then((m) => ({ default: m.AIChat })));
const DocumentationGenerator = lazy(() => import('./pages/DocumentationGenerator').then((m) => ({ default: m.DocumentationGenerator })));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard').then((m) => ({ default: m.HealthDashboard })));
const ChangeImpact = lazy(() => import('./pages/ChangeImpact').then((m) => ({ default: m.ChangeImpact })));
const CodeReview = lazy(() => import('./pages/CodeReview').then((m) => ({ default: m.CodeReview })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const MyRepositories = lazy(() => import('./pages/MyRepositories').then((m) => ({ default: m.MyRepositories })));
const SystemDesign = lazy(() => import('./pages/SystemDesign'));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

const PageFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center min-h-[200px]">
    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
      <span>Loading module...</span>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authEnabled, token, isCheckingAuth } = useAuthStore();
  if (isCheckingAuth) {
    return <PageFallback />;
  }
  if (authEnabled && !token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const LegacyRouteRedirect: React.FC<{ targetPage: string }> = ({ targetPage }) => {
  const activeRepositoryId = useWorkspaceStore((s) => s.activeRepositoryId);
  if (activeRepositoryId) {
    return <Navigate to={`/app/repositories/${activeRepositoryId}/${targetPage}`} replace />;
  }
  return <Navigate to="/app" replace />;
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public Pages */}
        <Route
          path="/"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <LandingPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/login"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Login />
            </ErrorBoundary>
          }
        />
        <Route
          path="/signup"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <Signup />
            </ErrorBoundary>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <ForgotPassword />
            </ErrorBoundary>
          }
        />
        <Route
          path="/reset-password"
          element={
            <ErrorBoundary resetKey={location.pathname}>
              <ResetPassword />
            </ErrorBoundary>
          }
        />

        {/* Authenticated Workspace Hub */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <ErrorBoundary resetKey={location.pathname}>
                <MyRepositories />
              </ErrorBoundary>
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
          {/* Unscoped Direct Routes (Redirect to Canonical Scoped Routes or /app) */}
          <Route path="/overview" element={<LegacyRouteRedirect targetPage="overview" />} />
          <Route path="/explorer" element={<LegacyRouteRedirect targetPage="explorer" />} />
          <Route path="/graph" element={<LegacyRouteRedirect targetPage="graph" />} />
          <Route path="/architecture" element={<LegacyRouteRedirect targetPage="architecture" />} />
          <Route path="/search" element={<LegacyRouteRedirect targetPage="search" />} />
          <Route path="/chat" element={<LegacyRouteRedirect targetPage="chat" />} />
          <Route path="/documentation" element={<LegacyRouteRedirect targetPage="documentation" />} />
          <Route path="/health-dashboard" element={<LegacyRouteRedirect targetPage="health-dashboard" />} />
          <Route path="/impact" element={<LegacyRouteRedirect targetPage="impact" />} />
          <Route path="/review" element={<LegacyRouteRedirect targetPage="review" />} />
          <Route path="/settings" element={<LegacyRouteRedirect targetPage="settings" />} />
          <Route path="/system-design" element={<LegacyRouteRedirect targetPage="system-design" />} />

          {/* Scoped Repository Routes: /app/repositories/:repositoryId/* */}
          <Route
            path="/app/repositories/:repositoryId"
            element={<Navigate to="explorer" replace />}
          />
          <Route
            path="/app/repositories/:repositoryId/overview"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <Overview />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/explorer"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <RepositoryExplorer />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/graph"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <DependencyGraph />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/architecture"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <ArchitectureViewer />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/search"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <SemanticSearch />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/chat"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <AIChat />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/documentation"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <DocumentationGenerator />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/health-dashboard"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <HealthDashboard />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/system-design"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <SystemDesign />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/impact"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <ChangeImpact />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/review"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <CodeReview />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/repositories/:repositoryId/settings"
            element={
              <ErrorBoundary resetKey={location.pathname}>
                <Settings />
              </ErrorBoundary>
            }
          />

        </Route>
        {/* Single canonical catch-all route at root level */}
        <Route path="*" element={<NotFound />} />
      </Routes>
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
