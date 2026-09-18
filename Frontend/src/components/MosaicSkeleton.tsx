/**
 * Chỗ giữ khung cho Grid3D trong lúc chunk 3D chưa được tải hoặc chưa được mount.
 * Kích thước bám sát khung thật ở Grid3D để không gây nhảy bố cục khi thay thế.
 */
export function MosaicSkeleton({ label = 'Đang chuẩn bị bức tường 3D…' }: { label?: string }) {
  return (
    <div className="w-full flex flex-col items-center py-4 relative">
      <div className="w-full aspect-[16/7] min-h-[300px] sm:min-h-[450px] md:min-h-[550px] overflow-hidden relative rounded-3xl border border-brand-border/60 bg-brand-card shadow-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-brand-textMuted">{label}</span>
        </div>
      </div>
      {/* Giữ chỗ cho hàng nút điều khiển bên dưới khung 3D. */}
      <div className="h-[52px]" aria-hidden />
    </div>
  );
}
