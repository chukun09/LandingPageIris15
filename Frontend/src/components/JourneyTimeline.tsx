import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, ChevronRight, Milestone } from 'lucide-react';

interface MilestoneItem {
  year: string;
  title: string;
  tagline: string;
  description: string;
  badge: string;
}

const MILESTONES: MilestoneItem[] = [
  {
    year: '2011',
    title: 'Khởi Nguồn Đam Mê',
    tagline: 'Đặt viên gạch đầu tiên',
    description: 'Những người đồng sáng lập tiên phong nhen nhóm ngọn lửa khát vọng, đặt nền móng cho sứ mệnh kiến tạo giá trị và văn hóa IRIS.',
    badge: 'Khởi nghiệp',
  },
  {
    year: '2015',
    title: 'Vững Bước Vươn Xa',
    tagline: 'Mở rộng quy mô & Khẳng định nội lực',
    description: 'Đội ngũ mở rộng nhanh chóng, chinh phục các dự án quy mô lớn và khẳng định uy tín với những đối tác chiến lược đầu tiên.',
    badge: 'Mở rộng',
  },
  {
    year: '2018',
    title: 'Bứt Phá Chuyển Mình',
    tagline: 'Hệ sinh thái sản phẩm mới',
    description: 'Đột phá về công nghệ và vận hành, ra mắt các giải pháp then chốt nâng tầm vị thế thương hiệu IRIS trên thị trường.',
    badge: 'Đột phá',
  },
  {
    year: '2021',
    title: 'Bản Lĩnh Vượt Sóng',
    tagline: 'Kiên cường trong thử thách',
    description: 'Vượt qua giai đoạn đầy biến động toàn cầu bằng tinh thần đoàn kết, tinh gọn và chuyển đổi linh hoạt không ngừng nghỉ.',
    badge: 'Vượt sóng',
  },
  {
    year: '2024',
    title: 'Hệ Sinh Thái Số & AI',
    tagline: 'Tiên phong làm chủ công nghệ',
    description: 'Ứng dụng mạnh mẽ trí tuệ nhân tạo và tự động hóa, tối ưu trải nghiệm và xây dựng văn hóa làm việc đổi mới sáng tạo.',
    badge: 'Tiên phong',
  },
  {
    year: '2026',
    title: '15 Năm Hoàng Kim',
    tagline: 'Tự hào chặng đường vàng — Vươn tầm tương lai',
    description: 'Hơn một thập kỷ rưỡi cống hiến, hàng trăm con người cùng chung một nhịp đập, sẵn sàng mở ra chương mới rực rỡ và bền vững hơn.',
    badge: 'Vinh quang 15 năm',
  },
];

export const JourneyTimeline: React.FC = () => {
  const [activeIdx, setActiveIdx] = useState(MILESTONES.length - 1);
  const activeItem = MILESTONES[activeIdx];

  return (
    <div className="glass-card p-6 md:p-8 space-y-6">
      {/* Tiêu đề mục */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-secondary/15 text-brand-secondary">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-brand-textPrimary flex items-center gap-2">
              Hành Trình 15 Năm Khát Vọng (2011 — 2026)
            </h3>
            <p className="text-xs text-brand-textSecondary">
              Những dấu mốc vàng son định hình nên bản sắc và vị thế IRIS hôm nay
            </p>
          </div>
        </div>
        <span className="spec-label self-start sm:self-auto bg-brand-surface px-2.5 py-1 rounded border border-brand-border">
          CỘT MỐC {activeIdx + 1} / {MILESTONES.length}
        </span>
      </div>

      {/* Thanh chọn các năm (Nút trượt) */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {MILESTONES.map((m, idx) => {
          const isSelected = idx === activeIdx;
          return (
            <motion.button
              key={m.year}
              onClick={() => setActiveIdx(idx)}
              className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                isSelected
                  ? 'bg-brand-primary/15 border-brand-secondary text-brand-secondary font-black shadow-sm dark:shadow-glow-primary scale-[1.02]'
                  : 'bg-brand-surface/70 border-brand-border hover:bg-brand-surfaceHover text-brand-textSecondary'
              }`}
              whileTap={{ scale: 0.96 }}
            >
              <span className="text-xs font-mono font-bold tracking-wider">{m.year}</span>
              <span className="text-[10px] truncate max-w-full text-brand-textMuted font-medium">
                {m.badge}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Chi tiết cột mốc đang chọn */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeItem.year}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="relative rounded-2xl bg-brand-surface/60 border border-brand-border/70 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        >
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-black text-brand-secondary">
                {activeItem.year}
              </span>
              <span className="text-brand-textMuted font-mono">/</span>
              <h4 className="text-base font-extrabold text-brand-textPrimary">
                {activeItem.title}
              </h4>
            </div>
            <p className="text-xs font-semibold text-brand-secondary/90 italic">
              “{activeItem.tagline}”
            </p>
            <p className="text-xs sm:text-sm text-brand-textSecondary leading-relaxed">
              {activeItem.description}
            </p>
          </div>

          <div className="shrink-0 flex md:flex-col items-center gap-2 border-t md:border-t-0 md:border-l border-brand-border/60 pt-4 md:pt-0 md:pl-6 w-full md:w-auto justify-between md:justify-center">
            <div className="flex items-center gap-1.5 text-xs text-brand-secondary font-bold">
              <Milestone className="w-4 h-4" />
              <span>Chặng đường vàng</span>
            </div>
            <button
              onClick={() => setActiveIdx((prev) => (prev + 1) % MILESTONES.length)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-textMuted hover:text-brand-textPrimary transition-colors"
            >
              Mốc kế tiếp <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
