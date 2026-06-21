import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  loading = false,
  placeholder = 'Search repository — semantic code, functions, classes...',
}) => {
  const [query, setQuery] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
    >
      <div
        className="glass-panel-subtle relative overflow-hidden"
        style={{
          borderColor: isFocused ? 'var(--accent-primary)' : 'var(--border-color)',
          boxShadow: isFocused
            ? '0 0 0 3px rgba(96, 165, 250, 0.1), 0 0 30px rgba(96, 165, 250, 0.05)'
            : 'none',
          transition: 'border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Animated gradient border overlay on focus */}
        {isFocused && (
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(96, 165, 250, 0.05) 0%, rgba(167, 139, 250, 0.05) 50%, rgba(34, 211, 238, 0.05) 100%)',
              backgroundSize: '200% 200%',
              animation: 'gradientShift 4s ease infinite',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}

        {/* Shimmer loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 pointer-events-none animate-shimmer rounded-xl"
            style={{ opacity: 0.4 }}
          />
        )}

        <div className="relative flex items-center">
          {/* Search icon */}
          <span
            className="absolute left-5 flex items-center justify-center"
            style={{
              color: isFocused
                ? 'var(--accent-primary)'
                : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <Search size={20} />
            )}
          </span>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={loading}
            className="input-premium w-full !bg-transparent !border-none !rounded-xl !py-4 !pl-14 !pr-5 !text-sm !font-sans"
            style={{
              color: 'var(--text-primary)',
              outline: 'none',
              boxShadow: 'none',
            }}
          />

          {/* Submit button — inside the search bar */}
          {query.trim() && (
            <motion.button
              type="submit"
              disabled={loading}
              className="absolute right-3 btn-primary !px-4 !py-2 !text-xs !rounded-lg"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              Search
            </motion.button>
          )}
        </div>
      </div>
    </motion.form>
  );
};
