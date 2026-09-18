interface ProofFrameProps {
  /** Nhãn ở góc trên-trái, ví dụ tên file bản in. */
  slug: string;
  /** Dòng thông số ở góc dưới-phải: số ô, khổ, DPI. */
  spec?: string;
  children: React.ReactNode;
}

const MARK = 'absolute w-4 h-4 border-brand-textMuted/50 pointer-events-none';

/**
 * Khung "bản bông nhà in" bọc quanh khu vực 3D.
 *
 * Đây là chi tiết chữ ký của trang: dấu xén bốn góc và nhãn thông số là ngôn ngữ
 * của chính nghề in khổ lớn mà bức tường này rồi sẽ trở thành. Mọi chỗ khác giữ
 * yên tiếng để chi tiết này đứng một mình.
 */
export function ProofFrame({ slug, spec, children }: ProofFrameProps) {
  return (
    <div className="relative">
      {/* Dấu xén bốn góc */}
      <div className={`${MARK} -top-2 -left-2 border-t border-l`} aria-hidden />
      <div className={`${MARK} -top-2 -right-2 border-t border-r`} aria-hidden />
      <div className={`${MARK} -bottom-2 -left-2 border-b border-l`} aria-hidden />
      <div className={`${MARK} -bottom-2 -right-2 border-b border-r`} aria-hidden />

      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <span className="spec-label">{slug}</span>
        {spec && <span className="spec-label">{spec}</span>}
      </div>

      {children}
    </div>
  );
}
