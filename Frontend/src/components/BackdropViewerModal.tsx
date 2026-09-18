import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Maximize2, TriangleAlert, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface BackdropWarning {
  postId: number;
  sourceShortEdgePx: number;
  requiredPx: number;
}

interface BackdropJob {
  jobId: string;
  state: 'Queued' | 'Running' | 'Completed' | 'Failed';
  progress: number;
  stage: string;
  error: string | null;
  photoCount: number;
  fileName: string | null;
  fileBytes: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  previewUrl: string | null;
  downloadUrl: string | null;
  warnings: BackdropWarning[];
}

type BackdropTheme = 'dark' | 'light';

interface Preflight {
  photoCount: number;
  minPhotos: number;
  trimWidthMm: number;
  trimHeightMm: number;
  effectiveDpi: number;
  metadataDpi: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  megapixels: number;
  estimatedPeakMb: number;
  exceedsMemoryCap: boolean;
  largestTileEdgePx: number;
  format: string;
  lowResolutionPhotos: BackdropWarning[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Chọn nền bản in. Hai bản được cache riêng nên đổi qua lại không phải dựng lại
 * bản đã có.
 */
function ThemePicker({
  value,
  onChange,
  compact = false,
}: {
  value: BackdropTheme;
  onChange: (t: BackdropTheme) => void;
  compact?: boolean;
}) {
  const options: { id: BackdropTheme; label: string; swatch: string; hint: string }[] = [
    { id: 'dark', label: 'Nền tối', swatch: '#0B0C0E', hint: 'Phông sân khấu' },
    { id: 'light', label: 'Nền giấy', swatch: '#FAF8F4', hint: 'Backdrop chụp ảnh' },
  ];

  return (
    <div className={`inline-flex items-center gap-1 ${compact ? '' : 'justify-center'}`}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            title={o.hint}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              active
                ? 'border-brand-secondary text-brand-textPrimary'
                : 'border-brand-border text-brand-textMuted hover:text-brand-textSecondary'
            }`}
          >
            <span
              className="w-3 h-3 rounded-sm border border-brand-border"
              style={{ backgroundColor: o.swatch }}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function BackdropViewerModal({ isOpen, onClose }: Props) {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [job, setJob] = useState<BackdropJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [theme, setTheme] = useState<BackdropTheme>('dark');
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Ước lượng ngay khi mở, để admin thấy khổ và bộ nhớ trước khi bấm dựng.
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setError(null);

    fetch('/api/backdrop/preflight', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setPreflight)
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setError('Không lấy được thông số bản in.');
      });

    return () => {
      controller.abort();
      stopPolling();
    };
  }, [isOpen, stopPolling]);

  const poll = useCallback(
    (jobId: string) => {
      const tick = async () => {
        try {
          const res = await fetch(`/api/backdrop/jobs/${jobId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const next: BackdropJob = await res.json();
          setJob(next);

          if (next.state === 'Queued' || next.state === 'Running') {
            pollRef.current = window.setTimeout(tick, 900);
          } else if (next.state === 'Failed') {
            setError(next.error ?? 'Dựng file in thất bại.');
          }
        } catch {
          setError('Mất kết nối khi theo dõi tiến độ.');
        }
      };
      void tick();
    },
    [],
  );

  const startRender = useCallback(async () => {
    setError(null);
    setScale(1);
    stopPolling();
    try {
      const res = await fetch(`/api/backdrop/jobs?theme=${theme}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: BackdropJob = await res.json();
      setJob(created);
      // 200 nghĩa là đã có sẵn file khớp bố cục và thông số; 202 thì phải chờ.
      if (created.state !== 'Completed') poll(created.jobId);
    } catch {
      setError('Không đặt được yêu cầu dựng file in.');
    }
  }, [poll, stopPolling, theme]);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setJob(null);
      setScale(1);
    }
  }, [isOpen, stopPolling]);

  // Đổi nền là đổi file: quay về trạng thái chờ dựng thay vì hiện bản cũ.
  const handleThemeChange = useCallback(
    (next: BackdropTheme) => {
      if (next === theme) return;
      stopPolling();
      setTheme(next);
      setJob(null);
      setError(null);
      setScale(1);
    },
    [theme, stopPolling],
  );

  const busy = job?.state === 'Queued' || job?.state === 'Running';
  const done = job?.state === 'Completed';
  const warnings = job?.warnings ?? preflight?.lowResolutionPhotos ?? [];

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-6xl">
      <div className="flex flex-col h-[85vh] max-h-[900px]">
        {/* Đầu bảng */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-brand-border">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5 text-brand-secondary" />
            <div>
              <h3 className="font-display text-base font-bold text-brand-textPrimary">Bản bông backdrop</h3>
              {preflight && (
                <p className="spec-label mt-0.5">
                  {preflight.trimWidthMm} × {preflight.trimHeightMm} MM · {preflight.effectiveDpi} DPI
                  {' · '}
                  {preflight.canvasWidthPx.toLocaleString()} × {preflight.canvasHeightPx.toLocaleString()} PX
                  {' · '}
                  {preflight.megapixels} MPX
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md border border-brand-border text-brand-textMuted hover:text-brand-textPrimary transition-colors"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Vùng xem */}
        <div className="flex-1 relative overflow-auto bg-brand-bgDeep flex items-center justify-center p-4">
          {error && (
            <div className="text-center max-w-md">
              <p className="text-sm font-semibold text-brand-danger mb-1">{error}</p>
              <p className="text-xs text-brand-textMuted">Thử lại, hoặc hạ DPI nếu máy chủ báo thiếu bộ nhớ.</p>
            </div>
          )}

          {!error && busy && (
            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
              <Loader2 className="w-7 h-7 text-brand-secondary animate-spin" />
              <p className="text-xs font-mono text-brand-textSecondary">{job?.stage}</p>
              <div className="w-full h-1 bg-brand-surface rounded overflow-hidden">
                <div
                  className="h-full bg-brand-secondary transition-all duration-300"
                  style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {!error && !busy && !done && (
            <div className="text-center max-w-md space-y-4">
              <p className="text-sm text-brand-textSecondary">
                Bản in được ghép từ đúng bố cục đang hiển thị trên trang, mỗi ảnh một ô, không lặp ảnh.
              </p>
              {preflight && (
                <p className="text-xs text-brand-textMuted font-mono">
                  Ước tính {preflight.estimatedPeakMb.toLocaleString()} MB bộ nhớ · ô lớn nhất{' '}
                  {preflight.largestTileEdgePx} px · ghi metadata {preflight.metadataDpi} DPI
                </p>
              )}
              {preflight?.exceedsMemoryCap && (
                <p className="text-xs text-brand-danger">
                  Khổ này vượt trần bộ nhớ cấu hình cho máy chủ. Hạ DPI hoặc nâng Backdrop:MaxOutputMegapixels.
                </p>
              )}
              <ThemePicker value={theme} onChange={handleThemeChange} />
              <button onClick={startRender} className="btn-gold text-xs px-5 py-2.5">
                Dựng file in
              </button>
            </div>
          )}

          {!error && done && job?.previewUrl && (
            <img
              src={job.previewUrl}
              alt="Bản bông backdrop IRIS 15"
              style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
              className="max-w-full h-auto transition-transform duration-150 border border-brand-border"
            />
          )}
        </div>

        {/* Cảnh báo ảnh thiếu nét */}
        {warnings.length > 0 && (
          <div className="px-6 py-3 border-t border-brand-border bg-brand-surface/60">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-brand-secondary mb-1">
              <TriangleAlert className="w-3.5 h-3.5" />
              {warnings.length} ảnh không đủ độ phân giải cho ô được gán
            </p>
            <p className="text-[11px] text-brand-textMuted font-mono">
              {warnings.slice(0, 6).map((w) => `#${w.postId}: ${w.sourceShortEdgePx}→${w.requiredPx}px`).join('  ·  ')}
              {warnings.length > 6 && `  ·  và ${warnings.length - 6} ảnh khác`}
            </p>
          </div>
        )}

        {/* Chân bảng */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-brand-border">
          <div className="spec-label">
            {done && job?.fileName ? `${job.fileName} · ${mb(job.fileBytes)}` : 'CHƯA DỰNG'}
          </div>
          <div className="flex items-center gap-2">
            {done && (
              <>
                <ThemePicker value={theme} onChange={handleThemeChange} compact />
                <button
                  onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                  className="p-2 rounded-md border border-brand-border text-brand-textSecondary hover:text-brand-textPrimary transition-colors"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setScale((s) => Math.min(4, s + 0.25))}
                  className="p-2 rounded-md border border-brand-border text-brand-textSecondary hover:text-brand-textPrimary transition-colors"
                  title="Phóng to"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={startRender}
                  className="text-[11px] font-semibold px-3 py-2 rounded-md border border-brand-border text-brand-textSecondary hover:text-brand-textPrimary transition-colors"
                >
                  Dựng lại
                </button>
                {/* Tải file master: chỉ truyền khi bấm, không phải khi xem. */}
                <a
                  href={job!.downloadUrl!}
                  download
                  className="btn-gold text-xs px-4 py-2.5 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Tải file in
                </a>
              </>
            )}
            {!done && !busy && (
              <span className="spec-label flex items-center gap-1.5">
                <Maximize2 className="w-3 h-3" /> ẢNH XEM TRƯỚC 2500 PX
              </span>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
