import { Eye, EyeOff, FileImage, Maximize2, Minus, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '~/components/i18n-provider';
import { Button } from '~/components/ui/button';
import type { TextBox } from '~/lib/ocr/types';
import { cn } from '~/lib/utils';

interface OcrCanvasProps {
  imageSrc: string;
  boxes: TextBox[];
  highlightedIndex: number | null;
  onBoxClick: (index: number) => void;
  /** Source file name shown in the pane header. */
  fileName?: string;
  /** Source file size in bytes. */
  fileSize?: number;
  /** Optional footer content (e.g. PDF page navigation). */
  pager?: React.ReactNode;
  className?: string;
}

// Overlay strokes use blue-700 (ring) regardless of theme. State is
// carried by lineWidth and alpha, not hue — per Geist single-accent philosophy.
const STROKE = '#006bff';
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / 1024).toFixed(2)}KB`;
}

export function OcrCanvas({
  imageSrc,
  boxes,
  highlightedIndex,
  onBoxClick,
  fileName,
  fileSize,
  pager,
  className,
}: OcrCanvasProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const parentW = canvas.parentElement?.clientWidth ?? 800;
      const baseScale = Math.min(1, parentW / img.width);
      const scale = baseScale * zoom;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (showOverlay && boxes.length > 0) {
        for (let i = 0; i < boxes.length; i++) {
          const box = boxes[i];
          if (!box) continue;
          const isHighlighted = i === highlightedIndex;
          ctx.strokeStyle = STROKE;
          ctx.lineWidth = isHighlighted ? 3 : 2;
          ctx.globalAlpha = isHighlighted ? 1 : 0.7;

          ctx.beginPath();
          const points = box.points.map((p) => [(p[0] ?? 0) * scale, (p[1] ?? 0) * scale]);
          ctx.moveTo(points[0]?.[0] ?? 0, points[0]?.[1] ?? 0);
          for (let j = 1; j < points.length; j++) {
            ctx.lineTo(points[j]?.[0] ?? 0, points[j]?.[1] ?? 0);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };
    img.src = imageSrc;
  }, [imageSrc, boxes, highlightedIndex, showOverlay, zoom]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || boxes.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scale = canvasRef.current.width / (imageSize.width || 1);

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!box) continue;
      const pts = box.points.map((p) => [(p[0] ?? 0) * scale, (p[1] ?? 0) * scale]);
      if (isPointInPolygon(x, y, pts)) {
        onBoxClick(i);
        return;
      }
    }
  };

  const adjustZoom = (delta: number) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-lg border bg-card', className)}>
      {/* Header — source file identity */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs text-foreground">{fileName ?? 'source'}</span>
          {fileSize ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatSize(fileSize)}
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            {imageSize.width > 0 ? `${imageSize.width}×${imageSize.height}` : '—'}
            <span className="mx-1.5 text-muted-foreground">·</span>
            {t('source.boxes', { n: boxes.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setShowOverlay(!showOverlay)}
            aria-label={showOverlay ? t('source.hideBoxes') : t('source.showBoxes')}
          >
            {showOverlay ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Body — scrollable viewport */}
      <div className="flex-1 overflow-auto bg-background p-2">
        <canvas ref={canvasRef} onClick={handleCanvasClick} className="cursor-crosshair rounded" />
      </div>

      {/* Footer — pager + zoom controls */}
      <div className="flex items-center justify-between gap-2 border-t bg-muted px-2 py-1.5">
        <div className="min-w-0">{pager}</div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => adjustZoom(-0.25)}
            disabled={zoom <= MIN_ZOOM}
            aria-label={t('source.zoomOut')}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-11 text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => adjustZoom(0.25)}
            disabled={zoom >= MAX_ZOOM}
            aria-label={t('source.zoomIn')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom(1)}
            aria-label={t('source.zoomReset')}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isPointInPolygon(x: number, y: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]?.[0] ?? 0;
    const yi = polygon[i]?.[1] ?? 0;
    const xj = polygon[j]?.[0] ?? 0;
    const yj = polygon[j]?.[1] ?? 0;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
