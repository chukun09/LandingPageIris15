import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Award } from 'lucide-react';
import { fireCelebration } from './CelebrationConfetti';

// Thiết lập mốc thời gian Đại lễ Gala 15 năm (tháng 10 năm 2026 hoặc ngày kỷ niệm công ty)
const GALA_DATE = new Date('2026-10-15T18:00:00+07:00').getTime();

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const GalaCountdown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculate = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, GALA_DATE - now);

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / 1000 / 60) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheer = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    fireCelebration(rect.left + rect.width / 2, rect.top);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-card/95 via-brand-surface/90 to-brand-card/95 border border-brand-secondary/30 p-6 md:p-8 shadow-lg dark:shadow-glow-primary">
      {/* Viền hào quang vàng lấp lánh */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-secondary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Tiêu đề & Thông điệp */}
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-secondary/15 border border-brand-secondary/30 text-brand-secondary text-xs font-bold">
            <Award className="w-3.5 h-3.5" />
            <span>ĐẠI LỄ GALA KỶ NIỆM 15 NĂM IRIS</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-brand-textPrimary">
            Đếm ngược đến Đêm Hội <span className="gradient-text-gold">Hoàng Kim</span>
          </h2>
          <p className="text-xs text-brand-textSecondary max-w-md">
            Cùng đếm ngược từng khoảnh khắc hướng về đêm hội tụ vinh danh chặng đường 15 năm tự hào và vươn xa của đại gia đình IRIS.
          </p>
        </div>

        {/* Các khối đếm thời gian */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {[
            { label: 'NGÀY', value: timeLeft.days },
            { label: 'GIỜ', value: timeLeft.hours },
            { label: 'PHÚT', value: timeLeft.minutes },
            { label: 'GIÂY', value: timeLeft.seconds },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <motion.div
                key={item.value}
                initial={{ scale: 0.92, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-14 sm:w-16 h-16 sm:h-18 rounded-xl bg-brand-bg/80 border border-brand-border/80 flex items-center justify-center shadow-inner"
              >
                <span className="font-mono text-2xl sm:text-3xl font-black text-brand-secondary">
                  {String(item.value).padStart(2, '0')}
                </span>
              </motion.div>
              <span className="text-[10px] font-bold text-brand-textMuted tracking-wider mt-1.5 font-mono">
                {item.label}
              </span>
            </div>
          ))}

          {/* Nút Thắp sáng / Chúc mừng */}
          <motion.button
            onClick={handleCheer}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="ml-2 btn-gold p-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md group"
            title="Thắp sáng ăn mừng"
          >
            <Sparkles className="w-5 h-5 text-amber-950 group-hover:rotate-12 transition-transform" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};
