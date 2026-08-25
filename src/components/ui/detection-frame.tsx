import type React from 'react';
import { cn } from '~/lib/utils';

interface DetectionFrameProps {
  children: React.ReactNode;
  /** Mono tag pinned to the top-right corner, e.g. a confidence value. */
  label?: string;
  /** Mono tag pinned to the bottom-left corner, e.g. coordinates. */
  coord?: string;
  /** Show a single-pass scan beam on mount. */
  scan?: 'once';
  className?: string;
  contentClassName?: string;
}

/** Corner registration brackets + optional mono tags and a scan beam. */
export function DetectionFrame({
  children,
  label,
  coord,
  scan,
  className,
  contentClassName,
}: DetectionFrameProps) {
  const corner = 'pointer-events-none absolute h-3 w-3 border-foreground';

  return (
    <div className={cn('relative', className)}>
      <span className={cn(corner, 'left-0 top-0 border-l-2 border-t-2')} />
      <span className={cn(corner, 'right-0 top-0 border-r-2 border-t-2')} />
      <span className={cn(corner, 'bottom-0 left-0 border-b-2 border-l-2')} />
      <span className={cn(corner, 'bottom-0 right-0 border-b-2 border-r-2')} />

      {scan === 'once' && <span className="scan-beam-once" />}

      {label && (
        <span className="absolute -top-2 right-2 bg-background px-1 font-mono text-[10px] font-medium leading-none tracking-wider text-foreground">
          {label}
        </span>
      )}
      {coord && (
        <span className="absolute -bottom-2 left-2 bg-background px-1 font-mono text-[10px] leading-none text-muted-foreground">
          {coord}
        </span>
      )}

      <div className={contentClassName}>{children}</div>
    </div>
  );
}
