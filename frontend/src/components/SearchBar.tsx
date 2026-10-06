import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  initialValue?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  loading = false,
  placeholder = 'Search repository — semantic code, functions, classes...',
  initialValue = '',
}) => {
  const [query, setQuery] = useState<string>(initialValue);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialValue !== undefined) {
      setQuery(initialValue);
    }
  }, [initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto"
    >
      <div
        className="relative overflow-hidden rounded-lg border transition-colors"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: isFocused ? 'var(--accent-primary)' : 'var(--border-color)',
        }}
      >
        {/* Shimmer loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 pointer-events-none animate-shimmer"
            style={{ opacity: 0.3 }}
          />
        )}

        <div className="relative flex items-center">
          {/* Search icon */}
          <span
            className="absolute left-4 flex items-center justify-center pointer-events-none"
            style={{
              color: isFocused
                ? 'var(--accent-primary)'
                : 'var(--text-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <Search size={18} />
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
            className="w-full bg-transparent py-3 pl-11 pr-24 text-sm font-sans"
            style={{
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />

          {/* Submit button — inside the search bar */}
          <AnimatePresence>
            {query.trim() && (
              <motion.button
                type="submit"
                disabled={loading}
                className="absolute right-2 btn-primary !px-3 !py-1.5 !text-xs !rounded-md"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                Search
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
};
