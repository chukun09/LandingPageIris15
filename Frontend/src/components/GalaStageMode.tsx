import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, ChevronRight, ChevronLeft, Sparkles, Award } from 'lucide-react';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
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

  useEffect(() => {
    if (!isOpen || !isPlaying || posts.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % posts.length);
    }, 7000); // 7 giây mỗi bức ảnh

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, posts.length]);

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
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {activePost && (
          <img
            src={activePost.thumbnailUrl || activePost.thumbnailImagePath}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-125"
          />
        )}
      </div>

      {/* Header sân khấu */}
      <header className="relative z-10 p-6 md:p-8 flex items-center justify-between border-b border-white/10 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="bg-white/95 rounded-xl px-3 py-1.5 shadow-md">
            <img
              src="/LOGO 15th IRIS - FINAL _LOGO 15th IRIS - CHOT2.png"
              alt="15th IRIS"
              className="h-10 md:h-12 w-auto object-contain"
            />
          </div>
          <div>
            <span className="text-[11px] font-mono tracking-widest text-amber-400 font-bold uppercase block">
              CHẾ ĐỘ SÂN KHẤU · ĐẠI LỄ KỶ NIỆM 15 NĂM
            </span>
            <h1 className="text-base md:text-xl font-black text-white">
              Vinh Danh Những Mảnh Ghép Kỳ Tích
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-white/60 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
            {currentIndex + 1} / {posts.length} KỶ NIỆM
          </span>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Thoát chế độ sân khấu (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Khu vực trình chiếu chính (Ken Burns Effect) */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6 md:p-12">
        <AnimatePresence mode="wait">
          {activePost && (
            <motion.div
              key={activePost.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-slate-900/80 border border-amber-500/30 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-xl"
            >
              {/* Cột ảnh với hiệu ứng zoom nghệ thuật */}
              <div className="md:col-span-6 aspect-[4/3] rounded-2xl overflow-hidden border border-amber-500/40 relative shadow-lg">
                <motion.img
                  src={activePost.thumbnailUrl || activePost.thumbnailImagePath}
                  alt="Kỷ niệm"
                  className="w-full h-full object-cover"
                  animate={{ scale: [1, 1.08] }}
                  transition={{ duration: 7, ease: 'linear' }}
                />
                <div className="absolute top-3 left-3 bg-amber-500 text-slate-950 font-black text-xs px-3 py-1 rounded-full shadow">
                  {activePost.department || 'Đại gia đình IRIS'}
                </div>
              </div>

              {/* Cột nội dung lời chúc */}
              <div className="md:col-span-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                    <span className="text-xs font-mono font-bold tracking-wider">
                      MẢNH GHÉP SỐ #{activePost.id}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                    Lời Chúc Tri Ân 15 Năm
                  </h2>
                </div>

                <div className="relative pl-6 border-l-2 border-amber-500/50">
                  <span className="absolute -top-3 -left-3 text-5xl text-amber-400/20 font-serif">“</span>
                  <p className="text-base md:text-xl text-slate-200 leading-relaxed italic font-serif whitespace-pre-line">
                    {activePost.message}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs text-white/60 font-mono">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
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
      <footer className="relative z-10 p-4 md:p-6 flex items-center justify-between border-t border-white/10 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentIndex((p) => (p - 1 + posts.length) % posts.length)}
            className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="p-3 rounded-xl bg-amber-500 text-white hover:bg-amber-400 font-bold transition-colors flex items-center gap-2 shadow-sm"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span className="text-xs font-mono hidden sm:inline">
              {isPlaying ? 'TẠM DỪNG' : 'TIẾP TỤC'}
            </span>
          </button>
          <button
            onClick={() => setCurrentIndex((p) => (p + 1) % posts.length)}
            className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
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

        <span className="text-[11px] text-white/50 font-mono">
          Nhấn Phím Cách để Dừng/Chạy · Phím Mũi tên để Chuyển ảnh
        </span>
      </footer>
    </div>
  );
};
