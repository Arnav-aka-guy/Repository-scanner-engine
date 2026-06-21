import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MainLayout } from './layouts/MainLayout';
import { RepositoryExplorer } from './pages/RepositoryExplorer';
import { DependencyGraph } from './pages/DependencyGraph';
import { ArchitectureViewer } from './pages/ArchitectureViewer';
import { SemanticSearch } from './pages/SemanticSearch';
import { AIChat } from './pages/AIChat';
import { DocumentationGenerator } from './pages/DocumentationGenerator';
import { Settings } from './pages/Settings';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ToastContainer } from './components/ToastContainer';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<MainLayout />}>
          <Route
            path="/"
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
            path="/docs"
            element={
              <motion.div className="flex-1 flex flex-col overflow-hidden" {...pageVariants}>
                <DocumentationGenerator />
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
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedBackground />
      <AnimatedRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
