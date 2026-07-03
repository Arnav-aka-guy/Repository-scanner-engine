import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  FolderTree,
  Share2,
  Tv,
  Search,
  MessageSquare,
  FileText,
  Activity,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/* ─── Menu Data ─────────────────────────────────────────────── */

interface MenuItem {
  name: string;
  icon: LucideIcon;
  path: string;
}

const menuItems: MenuItem[] = [
  { name: 'Explorer', icon: FolderTree, path: '/' },
  { name: 'Graph', icon: Share2, path: '/graph' },
  { name: 'Architecture', icon: Tv, path: '/architecture' },
  { name: 'Search', icon: Search, path: '/search' },
  { name: 'AI Chat', icon: MessageSquare, path: '/chat' },
  { name: 'Docs', icon: FileText, path: '/docs' },
  { name: 'Health', icon: Activity, path: '/health' },
];

/* ─── Framer Variants ───────────────────────────────────────── */

const sidebarVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.15,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 360, damping: 24 },
  },
};

const orbVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20, delay: 0.05 },
  },
};

/* ─── Animated Active Indicator ─────────────────────────────── */

const ActiveIndicator: React.FC = () => (
  <motion.div
    layoutId="sidebar-active-indicator"
    className="absolute left-0 rounded-r-md"
    style={{
      width: '3.5px',
      height: '24px',
      backgroundColor: 'var(--accent-cyan)',
      boxShadow:
        '0 0 10px var(--accent-cyan), 0 0 20px rgba(34, 211, 238, 0.25)',
    }}
    initial={false}
    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
  />
);

/* ─── Sidebar Link ──────────────────────────────────────────── */

interface SidebarLinkProps {
  item: MenuItem;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ item }) => {
  const Icon = item.icon;

  return (
    <NavLink to={item.path} end={item.path === '/'} className="relative group">
      {({ isActive }) => (
        <motion.div
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center justify-center rounded-xl p-3 relative transition-colors duration-200"
          style={{
            color: isActive
              ? 'var(--accent-cyan)'
              : 'var(--text-muted)',
            background: isActive
              ? 'rgba(34, 211, 238, 0.06)'
              : 'transparent',
            boxShadow: isActive
              ? '0 0 20px rgba(34, 211, 238, 0.08)'
              : 'none',
          }}
        >
          <Icon size={18} />

          {/* Animated left indicator bar — shared layout for smooth travel */}
          {isActive && <ActiveIndicator />}

          {/* Glass tooltip — CSS transition only */}
          <div
            className="absolute left-16 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 pointer-events-none whitespace-nowrap z-50 px-3 py-1.5 rounded-lg font-mono tracking-wider border select-none"
            style={{
              fontSize: '10px',
              background: 'rgba(15, 15, 26, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
              boxShadow:
                '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
          >
            {item.name.toUpperCase()}
          </div>
        </motion.div>
      )}
    </NavLink>
  );
};

/* ─── Sidebar Component ─────────────────────────────────────── */

export const Sidebar: React.FC = () => {
  return (
    <div
      className="flex flex-col items-center justify-between border-r relative select-none"
      style={{
        width: '64px',
        background:
          'linear-gradient(to bottom, rgba(17, 17, 34, 0.95), rgba(11, 11, 20, 0.98))',
        borderColor: 'var(--border-color)',
        height: '100%',
        padding: '20px 0 20px',
        zIndex: 50,
      }}
    >
      {/* ── Top section ── */}
      <motion.div
        className="flex flex-col items-center gap-4 w-full"
        variants={sidebarVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Animated Gradient Logo Orb */}
        <motion.div variants={orbVariants} className="mb-2 relative">
          {/* Rotating subtle border ring */}
          <div
            className="absolute -inset-[2px] rounded-xl animate-spin-slow"
            style={{
              background:
                'conic-gradient(from 0deg, var(--accent-primary), var(--accent-purple), var(--accent-primary))',
              opacity: 0.4,
              borderRadius: '14px',
            }}
          />
          {/* Inner orb */}
          <div
            className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
            style={{
              background:
                'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
              backgroundSize: '200% 200%',
              animation: 'gradientShift 4s ease infinite',
            }}
          >
            {/* Core bright dot */}
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: '#fff',
                boxShadow:
                  '0 0 8px rgba(255,255,255,0.6), 0 0 20px var(--accent-primary)',
                animation: 'pulse-glow 2.5s ease-in-out infinite',
              }}
            />
          </div>
        </motion.div>

        {/* Menu Items */}
        {menuItems.map((item) => (
          <motion.div key={item.path} variants={itemVariants}>
            <SidebarLink item={item} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── Bottom section ── */}
      <motion.div
        className="flex flex-col items-center w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 22 }}
      >
        <SidebarLink item={{ name: 'Settings', icon: Settings, path: '/settings' }} />
      </motion.div>
    </div>
  );
};
