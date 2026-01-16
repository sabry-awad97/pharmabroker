/**
 * Groups Grid View Component
 *
 * Displays groups in an animated grid layout with pagination.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GroupCard, type GroupQuickAction } from './group-card';
import type { WhatsAppGroup } from '@pharmabroker/schemas/whatsapp';

interface GroupsGridViewProps {
  data: WhatsAppGroup[];
  onSelect: (groupId: string) => void;
  onHover?: (groupId: string) => void;
  onQuickAction?: (action: GroupQuickAction, groupId: string) => void;
  isLoading?: boolean;
  pageSize?: number;
}

export function GroupsGridView({
  data,
  onSelect,
  onHover,
  onQuickAction,
  isLoading = false,
  pageSize = 9,
}: GroupsGridViewProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.ceil(data.length / pageSize);

  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  // Reset page when data changes significantly
  useMemo(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [currentPage, totalPages]);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  // Calculate visible page dots (max 5)
  const getVisiblePages = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const half = 2;
    let start = currentPage - half;
    let end = currentPage + half;

    if (start < 0) {
      start = 0;
      end = 4;
    }

    if (end >= totalPages) {
      end = totalPages - 1;
      start = totalPages - 5;
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="space-y-6">
      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {paginatedData.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              onMouseEnter={() => onHover?.(group.id)}
            >
              <GroupCard
                group={group}
                onSelect={() => onSelect(group.id)}
                onQuickAction={onQuickAction}
                isLoading={isLoading}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-border/50 flex items-center justify-between border-t pt-4"
        >
          <p className="text-muted-foreground text-xs">
            Showing{' '}
            <span className="text-foreground font-medium">
              {currentPage * pageSize + 1}
            </span>
            -
            <span className="text-foreground font-medium">
              {Math.min((currentPage + 1) * pageSize, data.length)}
            </span>{' '}
            of{' '}
            <span className="text-foreground font-medium">{data.length}</span>
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page dots */}
            <div className="flex items-center gap-1 px-2">
              {visiblePages[0] > 0 && (
                <span className="text-muted-foreground px-1 text-xs">...</span>
              )}
              {visiblePages.map(idx => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    currentPage === idx
                      ? 'w-6 bg-emerald-500'
                      : 'bg-muted hover:bg-muted-foreground/30 w-2'
                  }`}
                  aria-label={`Go to page ${idx + 1}`}
                />
              ))}
              {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                <span className="text-muted-foreground px-1 text-xs">...</span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
