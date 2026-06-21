import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileTreeNode as FileTreeNodeType } from '../types/repository';
import { Folder, FolderOpen, File, ChevronRight } from 'lucide-react';

interface FileTreeProps {
  nodes: FileTreeNodeType[];
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}

export const FileTree: React.FC<FileTreeProps> = ({ nodes, onSelectFile, selectedPath }) => {
  return (
    <div className="w-full text-xs select-none font-mono">
      {nodes.map((node, index) => (
        <FileTreeNodeItem
          key={node.path}
          node={node}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
          depth={0}
          index={index}
        />
      ))}
    </div>
  );
};

interface FileTreeNodeItemProps {
  node: FileTreeNodeType;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  depth: number;
  index: number;
}

const getFileIconColor = (extension?: string): string => {
  const ext = extension?.toLowerCase();
  switch (ext) {
    case '.py':
      return 'var(--accent-yellow)';
    case '.ts':
    case '.tsx':
      return 'var(--accent-primary)';
    case '.js':
    case '.jsx':
      return '#f59e0b'; // amber-500
    case '.css':
    case '.scss':
    case '.sass':
      return 'var(--accent-purple)';
    case '.html':
      return '#f97316'; // orange-500
    case '.json':
    case '.yaml':
    case '.yml':
      return 'var(--accent-cyan)';
    case '.md':
    case '.mdx':
      return 'var(--accent-green)';
    case '.rs':
      return 'var(--accent-rose)';
    default:
      return 'var(--text-muted)';
  }
};

const childrenVariants = {
  open: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
      opacity: { duration: 0.2, delay: 0.05 },
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
      opacity: { duration: 0.15 },
    },
  },
};

const childItemVariants = {
  open: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  },
  closed: {
    opacity: 0,
    x: -6,
    transition: { duration: 0.12 },
  },
};

const FileTreeNodeItem: React.FC<FileTreeNodeItemProps> = ({
  node,
  onSelectFile,
  selectedPath,
  depth,
  index,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const isDirectory = node.type === 'directory';
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDirectory) {
      setIsOpen((prev) => !prev);
    } else {
      onSelectFile(node.path);
    }
  };

  const iconColor = getFileIconColor(node.extension);

  return (
    <motion.div
      className="w-full"
      variants={childItemVariants}
      initial="closed"
      animate="open"
      exit="closed"
    >
      {/* Node Row */}
      <motion.div
        onClick={handleClick}
        className="relative flex items-center gap-1.5 py-[5px] cursor-pointer rounded-md group"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '8px',
        }}
        initial={false}
        whileHover={{
          backgroundColor: isSelected
            ? 'rgba(26, 26, 46, 0.8)'
            : 'rgba(26, 26, 46, 0.5)',
        }}
        animate={{
          backgroundColor: isSelected
            ? 'rgba(26, 26, 46, 0.7)'
            : 'rgba(0, 0, 0, 0)',
        }}
        transition={{ duration: 0.15 }}
      >
        {/* Selected accent bar */}
        {isSelected && (
          <motion.div
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            layoutId="file-tree-selected-bar"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}

        {/* Chevron for directories */}
        {isDirectory ? (
          <motion.span
            className="flex-shrink-0 flex items-center justify-center"
            style={{ color: 'var(--text-muted)', width: '14px', height: '14px' }}
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <ChevronRight size={13} />
          </motion.span>
        ) : (
          <span className="w-[14px] flex-shrink-0" />
        )}

        {/* Directory / File Icon */}
        {isDirectory ? (
          <span
            className="flex-shrink-0 flex items-center"
            style={{ color: 'var(--accent-primary)' }}
          >
            {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
          </span>
        ) : (
          <span
            className="flex-shrink-0 flex items-center"
            style={{ color: iconColor }}
          >
            <File size={14} />
          </span>
        )}

        {/* Node Name */}
        <span
          className="truncate leading-tight"
          style={{
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: isSelected ? 500 : 400,
          }}
        >
          {node.name}
        </span>
      </motion.div>

      {/* Recursive Children with AnimatePresence */}
      <AnimatePresence initial={false}>
        {isDirectory && isOpen && node.children && (
          <motion.div
            className="w-full overflow-hidden"
            variants={childrenVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            {node.children.map((child, childIndex) => (
              <FileTreeNodeItem
                key={child.path}
                node={child}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
                depth={depth + 1}
                index={childIndex}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
