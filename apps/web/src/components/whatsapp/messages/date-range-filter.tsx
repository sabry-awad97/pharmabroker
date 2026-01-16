/**
 * Date Range Filter Component
 *
 * Allows filtering messages by date range.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  dateFrom?: Date;
  dateTo?: Date;
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
  className?: string;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateChange,
  className,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  const dateRange: DateRange | undefined =
    dateFrom || dateTo ? { from: dateFrom, to: dateTo } : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    onDateChange(range?.from, range?.to);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateChange(undefined, undefined);
  };

  const hasValue = dateFrom || dateTo;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'justify-start text-left font-normal',
              !hasValue && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateFrom ? (
              dateTo ? (
                <>
                  {format(dateFrom, 'LLL dd')} - {format(dateTo, 'LLL dd')}
                </>
              ) : (
                format(dateFrom, 'LLL dd, y')
              )
            ) : (
              'Date range'
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateFrom}
            selected={dateRange}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
          <div className="flex justify-between border-t p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                onDateChange(weekAgo, today);
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const monthAgo = new Date(today);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                onDateChange(monthAgo, today);
              }}
            >
              Last 30 days
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {hasValue && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          className="text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
