import { Pill } from 'lucide-react';

import { ModeToggle } from './mode-toggle';
import UserMenu from './user-menu';

export default function Header() {
  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur"
    >
      {/* App Title - draggable area */}
      <div data-tauri-drag-region className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/10">
          <Pill className="h-3.5 w-3.5 text-emerald-500" />
        </div>
        <span className="text-sm font-medium">PharmaBroker</span>
      </div>

      {/* Actions - not draggable */}
      <div className="flex items-center gap-1">
        <ModeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
