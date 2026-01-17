/**
 * Message Preview Component
 *
 * Displays a preview of the message content with truncation.
 */

import { Image, Video, Mic, File, MapPin, Sticker } from 'lucide-react';

import { cn } from '@/lib/utils';

interface MessagePreviewProps {
  text?: string | null;
  caption?: string | null;
  filename?: string | null;
  messageType: string;
  maxLength?: number;
  className?: string;
}

export function MessagePreview({
  text,
  caption,
  filename,
  messageType,
  maxLength = 100,
  className,
}: MessagePreviewProps) {
  // Get the display text based on message type
  const getDisplayContent = () => {
    if (text) {
      return { type: 'text', content: text };
    }

    if (caption) {
      return { type: 'caption', content: caption };
    }

    if (filename) {
      return { type: 'filename', content: filename };
    }

    // Fallback for media-only messages
    switch (messageType) {
      case 'image':
        return { type: 'media', content: 'Photo', icon: Image };
      case 'video':
        return { type: 'media', content: 'Video', icon: Video };
      case 'audio':
        return { type: 'media', content: 'Voice message', icon: Mic };
      case 'document':
        return { type: 'media', content: 'Document', icon: File };
      case 'sticker':
        return { type: 'media', content: 'Sticker', icon: Sticker };
      case 'location':
        return { type: 'media', content: 'Location', icon: MapPin };
      default:
        return { type: 'empty', content: 'No content' };
    }
  };

  const display = getDisplayContent();

  // Truncate text if needed
  const truncate = (str: string) => {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength).trim() + '…';
  };

  if (display.type === 'media' && 'icon' in display && display.icon) {
    const Icon = display.icon;
    return (
      <div
        className={cn(
          'text-muted-foreground flex items-center gap-1.5 text-xs italic',
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{display.content}</span>
      </div>
    );
  }

  if (display.type === 'empty') {
    return (
      <span className={cn('text-muted-foreground text-xs italic', className)}>
        {display.content}
      </span>
    );
  }

  return (
    <p className={cn('text-foreground line-clamp-2 text-xs', className)}>
      {display.type === 'caption' && (
        <span className="text-muted-foreground mr-1">📷</span>
      )}
      {display.type === 'filename' && (
        <span className="text-muted-foreground mr-1">📎</span>
      )}
      {truncate(display.content)}
    </p>
  );
}
