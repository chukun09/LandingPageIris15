import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, ChevronRight, ChevronLeft, Sparkles, Award } from 'lucide-react';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  voteCount: number;
  createdAt: string;
  isPinned?: boolean;
}

interface GalaStageModeProps {
  posts: Post[];
  isOpen: boolean;
  onClose: () => void;
}

export const GalaStageMode: React.FC<GalaStageModeProps> = ({ posts, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Danh sách có thể co lại khi BTC gỡ bài trong lúc đang chiếu: chia lấy dư để không rơi ra ngoài mảng
  const safeIndex = posts.length > 0 ? currentIndex % posts.length : 0;
  const activePost = posts[safeIndex] || null;

  const getPostImageUrl = (post: Post | null): string => {
    if (!post) return '';
    return post.previewUrl || `/api/posts/${post.id}/preview`;
  };

  // Hẹn giờ theo từng slide (không dùng setInterval) để khi bấm chuyển tay
  // thì đếm lại đủ 7 giây, khớp với thanh tiến trình
  useEffect(() => {
    if (!isOpen || !isPlaying || posts.length === 0) return;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % posts.length);
    }, 7000); // 7 giây mỗi bức ảnh

    return () => clearTimeout(timer);
  }, [isOpen, isPlaying, posts.length, currentIndex]);

  // Khoá cuộn trang phía sau khi đang trình chiếu (chỉ khi thực sự có slide hiển thị)
  const isVisible = isOpen && posts.length > 0;
  useEffect(() => {
    if (!isVisible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isVisible]);

  // Preload ảnh của slide tiếp theo để khi chuyển cảnh không bị trễ hay nhấp nháy
  useEffect(() => {
    if (!isOpen || posts.length <= 1) return;
    const nextIndex = (safeIndex + 1) % posts.length;
    const nextPost = posts[nextIndex];
    if (nextPost) {
      const img = new Image();
      img.src = getPostImageUrl(nextPost);
    }
  }, [isOpen, safeIndex, posts]);

  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Chặn hành vi mặc định: Space đang focus vào nút sẽ "bấm" nút lần nữa
      // (đảo play/pause hai lần thành không đổi) và mũi tên/Space làm cuộn khung
      if ([' ', 'ArrowRight', 'ArrowLeft'].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentIndex((p) => (p + 1) % posts.length);
      if (e.key === 'ArrowLeft') setCurrentIndex((p) => (p - 1 + posts.length) % posts.length);
      if (e.key === ' ') setIsPlaying((p) => !p);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, posts.length, onClose]);

  if (!isOpen || posts.length === 0) return null;

  const message = (activePost?.message ?? '').normalize('NFC');

  // Bảng màu sáng cố định (không theo toggle sáng/tối của trang): nền giấy ngà,
  // chữ nâu than, điểm nhấn vàng champagne — dễ đọc trên màn LED hội trường.
  return (
    <div className="fixed inset-0 z-50 bg-[#FAF7F1] text-stone-900 flex flex-col justify-between overflow-hidden select-none">
      {/* Nền: ảnh hiện tại phủ mờ rất nhẹ + quầng sáng vàng ấm */}
      <div className="absolute inset-0 pointer-events-none">
        {activePost && (
          <img
            src={getPostImageUrl(activePost)}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-125 opacity-[0.14]"
            decoding="async"
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.9),transparent_60%)]" />
        <div className="absolute -bottom-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute -top-40 -right-40 w-[32rem] h-[32rem] rounded-full bg-orange-100/50 blur-3xl" />
      </div>

      {/* Header sân khấu */}
      <header className="relative z-10 px-4 py-3 sm:px-6 sm:py-4 md:px-10 md:py-5 flex items-center justify-between gap-3 border-b border-stone-200/80 bg-white/70 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <picture className="shrink-0">
            <source srcSet="/brand/logo-h480.webp" type="image/webp" />
            <img
              src="/brand/logo-h480.png"
              alt="15th IRIS"
              width={661}
              height={480}
              className="h-8 sm:h-11 md:h-14 w-auto object-contain"
            />
          </picture>
          <div className="h-8 sm:h-10 w-px bg-gradient-to-b from-transparent via-amber-400/70 to-transparent shrink-0 hidden sm:block" />
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[11px] font-mono tracking-[0.2em] text-amber-700 font-semibold uppercase hidden sm:block">
              Chế độ sân khấu · Đại lễ kỷ niệm 15 năm
            </span>
            <h1 className="text-sm sm:text-lg md:text-2xl font-black text-stone-900 leading-tight truncate">
              Vinh Danh Những Mảnh Ghép Kỳ Tích
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="font-mono text-[10px] sm:text-sm text-stone-600 bg-white px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full ring-1 ring-stone-200 shadow-sm whitespace-nowrap">
            <span className="font-bold text-amber-700">{safeIndex + 1}</span>
            <span className="text-stone-400"> / {posts.length}</span>
          </span>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-white ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 text-stone-600 hover:text-stone-900 transition-colors"
            title="Thoát chế độ sân khấu (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Khu vực trình chiếu chính (Ken Burns Effect) */}
      {/* Căn giữa bằng my-auto thay cho items-center: khi màn thấp nội dung tràn
          thì vẫn cuộn được từ mép trên, không bị cắt mất phần đầu thẻ */}
      <main className="relative z-10 flex-1 flex justify-center p-3 sm:p-6 md:p-10 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activePost && (
            <motion.div
              key={activePost.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative my-auto max-w-6xl w-full grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 md:gap-10 md:items-center bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8 ring-1 ring-stone-200/80 shadow-[0_30px_80px_-24px_rgba(120,85,30,0.28)]"
            >
              {/* Vạch vàng mảnh giữa mép trên thẻ */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 h-1 w-24 sm:w-32 rounded-b-full bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300" />

              {/* Cột ảnh chất lượng cao với Ambient Fill cho mọi tỉ lệ ảnh */}
              <div className="md:col-span-7 w-full aspect-[4/3] max-h-[32vh] sm:max-h-[42vh] md:max-h-[60vh] rounded-xl sm:rounded-2xl overflow-hidden relative bg-stone-100 ring-1 ring-black/5 flex items-center justify-center">
                {/* Lớp nền mờ Ambient cho ảnh không đúng khung 4:3 */}
                <img
                  src={getPostImageUrl(activePost)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover blur-xl opacity-60 scale-110 pointer-events-none"
                  decoding="async"
                />
                <motion.img
                  src={getPostImageUrl(activePost)}
                  alt="Kỷ niệm"
                  className="w-full h-full object-contain relative z-10 drop-shadow-md"
                  animate={{ scale: [1, 1.05] }}
                  transition={{ duration: 7, ease: 'linear' }}
                  decoding="async"
                  // Ảnh lỗi thì ẩn đi, chừa nền xám thay vì icon ảnh vỡ trên màn LED
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
                <div className="absolute top-2 left-2 sm:top-4 sm:left-4 max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] truncate bg-white/90 backdrop-blur text-amber-800 font-bold text-[10px] sm:text-xs px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full ring-1 ring-amber-200 shadow-sm z-20">
                  {activePost.department || 'Đại gia đình IRIS'}
                </div>
              </div>

              {/* Cột nội dung lời chúc */}
              <div className="md:col-span-5 flex flex-col justify-between min-h-0 gap-3 sm:gap-5 md:py-2">
                <div className="shrink-0 space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 text-amber-700">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-mono font-semibold tracking-[0.18em]">
                      MẢNH GHÉP SỐ #{activePost.id}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-stone-900 leading-tight">
                    Lời Chúc Tri Ân 15 Năm
                  </h2>
                  <div className="h-0.5 w-16 rounded-full bg-gradient-to-r from-amber-500 to-amber-300" />
                </div>

                <div className="relative flex-1 min-h-0 overflow-y-auto max-h-[34vh] sm:max-h-[42vh] md:max-h-[44vh] pr-2 custom-scrollbar">
                  <span className="absolute top-0 -left-1 text-6xl sm:text-7xl leading-none text-amber-300/70 font-serif select-none pointer-events-none">“</span>
                  <p className={`relative pt-6 sm:pt-8 text-stone-700 leading-relaxed whitespace-pre-line break-words ${
                    message.length > 350
                      ? 'text-sm sm:text-base md:text-lg'
                      : message.length > 180
                        ? 'text-base sm:text-lg md:text-xl'
                        : 'text-base sm:text-xl md:text-2xl font-medium'
                  }`}>
                    {message}
                  </p>
                </div>

                <div className="shrink-0 flex items-center justify-between pt-3 sm:pt-4 border-t border-stone-200 text-[10px] sm:text-xs text-stone-500 font-mono">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>IRIS 15 Years of Pride</span>
                  </div>
                  <span>{new Date(activePost.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Thanh điều khiển dưới đáy */}
      <footer className="relative z-10 px-4 py-3 sm:px-6 sm:py-4 md:px-10 flex items-center justify-between gap-3 border-t border-stone-200/80 bg-white/70 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setCurrentIndex((p) => (p - 1 + posts.length) % posts.length)}
            className="p-2.5 sm:p-3 rounded-full bg-white ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 text-stone-700 transition-colors"
            title="Trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="px-3 py-2.5 sm:px-5 sm:py-3 rounded-full bg-amber-600 text-white hover:bg-amber-500 font-bold transition-colors flex items-center gap-2 shadow-md shadow-amber-600/25"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span className="text-xs font-mono tracking-wider hidden sm:inline">
              {isPlaying ? 'TẠM DỪNG' : 'TIẾP TỤC'}
            </span>
          </button>
          <button
            onClick={() => setCurrentIndex((p) => (p + 1) % posts.length)}
            className="p-2.5 sm:p-3 rounded-full bg-white ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 text-stone-700 transition-colors"
            title="Sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh tiến trình tự chạy */}
        <div className="hidden md:flex flex-1 max-w-md mx-8 items-center gap-3">
          <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
            {/* Đổi key theo cả slide lẫn trạng thái chạy: tạm dừng thì về 0 ngay,
                chạy tiếp thì đếm lại đủ 7 giây khớp với hẹn giờ ở trên */}
            <motion.div
              key={`${safeIndex}-${isPlaying}`}
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: isPlaying ? '100%' : '0%' }}
              transition={{ duration: isPlaying ? 7 : 0, ease: 'linear' }}
            />
          </div>
        </div>

        <span className="text-[10px] sm:text-[11px] text-stone-500 font-mono hidden sm:block text-right">
          Phím Cách: Dừng/Chạy · Mũi tên: Chuyển ảnh · Esc: Thoát
        </span>
      </footer>
    </div>
  );
};
