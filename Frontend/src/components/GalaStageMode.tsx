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

  const activePost = posts[currentIndex] || null;

  const getPostImageUrl = (post: Post | null): string => {
    if (!post) return '';
    return post.previewUrl || `/api/posts/${post.id}/preview`;
  };

  useEffect(() => {
    if (!isOpen || !isPlaying || posts.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % posts.length);
    }, 7000); // 7 giây mỗi bức ảnh

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, posts.length]);

  // Preload ảnh của slide tiếp theo để khi chuyển cảnh không bị trễ hay nhấp nháy đen
  useEffect(() => {
    if (!isOpen || posts.length <= 1) return;
    const nextIndex = (currentIndex + 1) % posts.length;
    const nextPost = posts[nextIndex];
    if (nextPost) {
      const img = new Image();
      img.src = getPostImageUrl(nextPost);
    }
  }, [isOpen, currentIndex, posts]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentIndex((p) => (p + 1) % posts.length);
      if (e.key === 'ArrowLeft') setCurrentIndex((p) => (p - 1 + posts.length) % posts.length);
      if (e.key === ' ') setIsPlaying((p) => !p);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, posts.length, onClose]);

  if (!isOpen || posts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Background mờ chuyển động */}
      <div className="absolute inset-0 opacity-25 pointer-events-none">
        {activePost && (
          <img
            src={getPostImageUrl(activePost)}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-125"
            decoding="async"
          />
        )}
      </div>

      {/* Header sân khấu */}
      <header className="relative z-10 p-3 sm:p-5 md:p-6 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="bg-white/95 rounded-xl px-2 py-1 sm:px-3 sm:py-1.5 shadow-md shrink-0">
            <picture>
              <source srcSet="/brand/logo-h480.webp" type="image/webp" />
              <img
                src="/brand/logo-h480.png"
                alt="15th IRIS"
                width={661}
                height={480}
                className="h-7 sm:h-10 md:h-12 w-auto object-contain"
              />
            </picture>
          </div>
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[11px] font-mono tracking-widest text-amber-400 font-bold uppercase hidden sm:block">
              CHẾ ĐỘ SÂN KHẤU · ĐẠI LỄ KỶ NIỆM 15 NĂM
            </span>
            <h1 className="text-sm sm:text-base md:text-xl font-black text-white leading-tight truncate">
              Vinh Danh Những Mảnh Ghép Kỳ Tích
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="font-mono text-[10px] sm:text-xs text-white/60 bg-white/10 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-white/10 whitespace-nowrap">
            {currentIndex + 1}/{posts.length}
          </span>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Thoát chế độ sân khấu (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Khu vực trình chiếu chính (Ken Burns Effect) */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-3 sm:p-5 md:p-8 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activePost && (
            <motion.div
              key={activePost.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-5xl w-full max-h-full grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 md:gap-8 items-center bg-slate-900/80 border border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-xl"
            >
              {/* Cột ảnh chất lượng cao với Ambient Fill cho mọi tỉ lệ ảnh */}
              <div className="md:col-span-6 aspect-[4/3] max-h-[32vh] sm:max-h-[42vh] md:max-h-[56vh] rounded-xl sm:rounded-2xl overflow-hidden border border-amber-500/40 relative shadow-lg bg-slate-950 flex items-center justify-center shrink-0">
                {/* Lớp nền mờ Ambient cho ảnh không đúng khung 4:3 */}
                <img
                  src={getPostImageUrl(activePost)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 pointer-events-none"
                  decoding="async"
                />
                <motion.img
                  src={getPostImageUrl(activePost)}
                  alt="Kỷ niệm"
                  className="w-full h-full object-contain relative z-10"
                  animate={{ scale: [1, 1.05] }}
                  transition={{ duration: 7, ease: 'linear' }}
                  decoding="async"
                />
                <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-amber-500 text-slate-950 font-black text-[10px] sm:text-xs px-2.5 py-1 sm:px-3 rounded-full shadow z-20">
                  {activePost.department || 'Đại gia đình IRIS'}
                </div>
              </div>

              {/* Cột nội dung lời chúc */}
              <div className="md:col-span-6 flex flex-col justify-between h-full min-h-0 space-y-3 sm:space-y-4">
                <div className="shrink-0 space-y-1 sm:space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider">
                      MẢNH GHÉP SỐ #{activePost.id}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white leading-tight">
                    Lời Chúc Tri Ân 15 Năm
                  </h2>
                </div>

                <div className="relative pl-4 sm:pl-6 border-l-2 border-amber-500/50 flex-1 min-h-0 overflow-y-auto max-h-[34vh] sm:max-h-[42vh] md:max-h-[48vh] pr-2 custom-scrollbar my-1">
                  <span className="absolute -top-2 -left-2 sm:-top-3 sm:-left-3 text-4xl sm:text-5xl text-amber-400/20 font-serif select-none pointer-events-none">“</span>
                  <p className={`text-slate-200 leading-relaxed italic whitespace-pre-line ${
                    activePost.message.length > 350
                      ? 'text-xs sm:text-sm md:text-base'
                      : activePost.message.length > 180
                        ? 'text-sm sm:text-base md:text-lg'
                        : 'text-sm sm:text-base md:text-xl'
                  }`}>
                    {activePost.message.normalize('NFC')}
                  </p>
                </div>

                <div className="shrink-0 flex items-center justify-between pt-2 sm:pt-3 border-t border-white/10 text-[10px] sm:text-xs text-white/60 font-mono">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400 shrink-0" />
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
      <footer className="relative z-10 p-3 sm:p-4 md:p-5 flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setCurrentIndex((p) => (p - 1 + posts.length) % posts.length)}
            className="p-2.5 sm:p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="p-2.5 sm:p-3 rounded-xl bg-amber-500 text-white hover:bg-amber-400 font-bold transition-colors flex items-center gap-2 shadow-sm"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span className="text-xs font-mono hidden sm:inline">
              {isPlaying ? 'TẠM DỪNG' : 'TIẾP TỤC'}
            </span>
          </button>
          <button
            onClick={() => setCurrentIndex((p) => (p + 1) % posts.length)}
            className="p-2.5 sm:p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh tiến trình tự chạy */}
        <div className="hidden md:flex flex-1 max-w-md mx-8 items-center gap-3">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              key={currentIndex}
              className="h-full bg-amber-500"
              initial={{ width: '0%' }}
              animate={{ width: isPlaying ? '100%' : '0%' }}
              transition={{ duration: 7, ease: 'linear' }}
            />
          </div>
        </div>

        <span className="text-[10px] sm:text-[11px] text-white/50 font-mono hidden sm:block text-right">
          Nhấn Phím Cách để Dừng/Chạy · Phím Mũi tên để Chuyển ảnh
        </span>
      </footer>
    </div>
  );
};
