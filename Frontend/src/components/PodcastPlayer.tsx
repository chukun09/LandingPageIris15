import React, { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Pause, SkipForward, SkipBack, Music, Volume2, Download } from 'lucide-react';

interface Podcast {
  id: number;
  postId: number;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  createdAt: string;
}

interface PodcastPlayerProps {
  podcasts: Podcast[];
  currentPodcastIndex: number;
  onSelectPodcast: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

// Nhạc nền chỉ được tải khi người nghe thực sự bật nó, không phải khi vào trang.
// Ưu tiên file tự host (đặt tại Frontend/public/audio/bgm.mp3); nếu chưa có file thì
// khai báo VITE_BGM_URL để trỏ sang nguồn khác.
const BGM_URL = import.meta.env.VITE_BGM_URL ?? '/audio/bgm.mp3';

export const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  podcasts,
  currentPodcastIndex,
  onSelectPodcast,
  isPlaying,
  setIsPlaying,
}) => {
  const currentPodcast = podcasts[currentPodcastIndex] || null;

  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(0.08);

  // Thẻ <audio> nhạc nền khởi tạo rỗng; src chỉ được gán ở lần đầu thực sự phát.
  const bgmSrcAssigned = useRef(false);

  useEffect(() => {
    if (!voiceAudioRef.current) return;
    if (isPlaying) {
      voiceAudioRef.current.play().catch(() => setIsPlaying(false));
      if (bgmEnabled && bgmAudioRef.current) {
        if (!bgmSrcAssigned.current) {
          bgmAudioRef.current.src = BGM_URL;
          bgmAudioRef.current.loop = true;
          bgmAudioRef.current.volume = bgmVolume;
          bgmSrcAssigned.current = true;
        }
        bgmAudioRef.current.play().catch(() => {});
      }
    } else {
      voiceAudioRef.current.pause();
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
    }
  }, [isPlaying, currentPodcastIndex, bgmEnabled]);

  useEffect(() => {
    if (!voiceAudioRef.current) return;
    if (currentPodcast) {
      voiceAudioRef.current.src = currentPodcast.audioUrl;
      voiceAudioRef.current.load();
      if (isPlaying) voiceAudioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      voiceAudioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [currentPodcastIndex, currentPodcast?.audioUrl]);

  useEffect(() => {
    if (bgmAudioRef.current && bgmSrcAssigned.current) {
      bgmAudioRef.current.volume = bgmVolume;
      bgmAudioRef.current.loop = true;
    }
  }, [bgmVolume]);

  const handlePlayPause = () => {
    if (!currentPodcast) return;
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (podcasts.length === 0) return;
    onSelectPodcast((currentPodcastIndex + 1) % podcasts.length);
  };

  const handlePrev = () => {
    if (podcasts.length === 0) return;
    onSelectPodcast((currentPodcastIndex - 1 + podcasts.length) % podcasts.length);
  };

  const handleTimeUpdate = () => {
    if (voiceAudioRef.current) setCurrentTime(voiceAudioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (voiceAudioRef.current) setDuration(voiceAudioRef.current.duration);
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    handleNext();
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (voiceAudioRef.current) voiceAudioRef.current.currentTime = newTime;
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDownload = async (audioUrl: string, title: string) => {
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.target = '_blank';
      a.download = `${title}.mp3`;
      a.click();
    }
  };

  return (
    <div className={`glass-card p-8 flex flex-col items-center transition-shadow duration-500 ${
      isPlaying ? 'shadow-glow-gold' : 'shadow-glow-gold-sm'
    }`}>
      <audio
        ref={voiceAudioRef}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />
      <audio
        ref={bgmAudioRef}
        preload="none"
        onError={() => setBgmEnabled(false)}
      />

      {/* Vinyl with glow halo */}
      <div className="relative mb-6">
        {/* Pulsing halo behind vinyl when playing */}
        <AnimatePresence>
          {/* Chỉ hoạt hoá opacity — hoạt hoá scale trên lớp blur-2xl buộc trình duyệt
              raster lại vùng mờ mỗi khung hình. */}
          {isPlaying && (
            <motion.div
              className="absolute inset-0 rounded-full bg-brand-secondary/20 blur-2xl -z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.25, 0.5, 0.25] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </AnimatePresence>

        <div
          className={`w-32 h-32 rounded-full bg-gradient-to-tr from-brand-primary via-brand-secondary to-brand-accent p-1 flex items-center justify-center shadow-lg ${
            isPlaying ? 'animate-vinyl-spin' : ''
          }`}
        >
          <div className="w-full h-full bg-brand-card rounded-full flex items-center justify-center border-2 border-brand-border vinyl-grooves relative">
            <div className="w-4 h-4 rounded-full bg-brand-surface flex items-center justify-center z-10">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-textMuted" />
            </div>
            <Music className="w-10 h-10 text-brand-primary/10 absolute pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Podcast Title */}
      <h3 className="text-lg font-black text-brand-textPrimary text-center mb-1 line-clamp-1">
        {currentPodcast ? currentPodcast.title : 'Radio IRIS 15'}
      </h3>
      <p className="text-xs text-brand-textSecondary mb-3">
        {currentPodcast ? 'Số Phát Thanh Radio Kỷ Niệm 15 Năm' : 'Chọn một số phát thanh để nghe'}
      </p>

      {/* Audio Waveform Spectrum Visualizer */}
      <div className="flex items-end justify-center gap-1 h-7 mb-4 px-4 py-1 rounded-full bg-brand-surface/60 border border-brand-border/40">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className={`w-1 rounded-full transition-all ${
              isPlaying
                ? 'bg-gradient-to-t from-brand-secondary to-amber-300 wave-bar'
                : 'bg-brand-border h-1.5'
            }`}
            style={{
              height: isPlaying ? `${Math.abs(Math.sin((i + 1) * 0.6)) * 18 + 6}px` : '4px',
              animationDelay: `${(i % 5) * 0.14}s`,
              animationDuration: `${0.75 + (i % 3) * 0.25}s`,
            }}
          />
        ))}
      </div>

      {/* Progress Bar */}
      <div className="w-full mb-4">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleProgressChange}
          disabled={!currentPodcast}
          className="w-full h-1.5 bg-brand-surface rounded-lg appearance-none cursor-pointer accent-brand-primary focus:outline-none"
        />
        <div className="flex justify-between w-full text-[10px] text-brand-textSecondary font-fira mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 mb-6">
        <motion.button
          onClick={handlePrev}
          disabled={podcasts.length === 0}
          className="p-2.5 rounded-full bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary hover:bg-brand-surfaceHover active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
          whileTap={{ scale: 0.9 }}
          title="Bài trước"
        >
          <SkipBack className="w-4 h-4" />
        </motion.button>

        <motion.button
          onClick={handlePlayPause}
          disabled={!currentPodcast}
          className="btn-gold w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.9 }}
          title={isPlaying ? 'Tạm dừng' : 'Phát'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isPlaying ? (
              <motion.span
                key="pause"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
              >
                <Pause className="w-6 h-6 fill-current text-slate-900" />
              </motion.span>
            ) : (
              <motion.span
                key="play"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
              >
                <Play className="w-6 h-6 fill-current text-slate-900 translate-x-0.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.button
          onClick={handleNext}
          disabled={podcasts.length === 0}
          className="p-2.5 rounded-full bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary hover:bg-brand-surfaceHover active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
          whileTap={{ scale: 0.9 }}
          title="Bài tiếp theo"
        >
          <SkipForward className="w-4 h-4" />
        </motion.button>

        <motion.button
          onClick={() => currentPodcast && handleDownload(currentPodcast.audioUrl, currentPodcast.title)}
          disabled={!currentPodcast}
          className="p-2.5 rounded-full bg-brand-surface border border-brand-border text-brand-textSecondary hover:text-brand-primary hover:bg-brand-surfaceHover active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
          whileTap={{ scale: 0.9 }}
          title="Tải xuống số phát thanh này"
        >
          <Download className="w-4 h-4" />
        </motion.button>
      </div>

      {/* BGM Controls */}
      <div className="flex items-center justify-between w-full border-t border-brand-border pt-4 mt-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-brand-textSecondary cursor-pointer">
          <input
            type="checkbox"
            checked={bgmEnabled}
            onChange={(e) => setBgmEnabled(e.target.checked)}
            className="rounded border-brand-border bg-brand-surface text-brand-primary focus:ring-brand-primary h-3.5 w-3.5 accent-brand-primary"
          />
          <span className="flex items-center gap-1 select-none">
            <Music className="w-3.5 h-3.5 text-brand-primary" /> Nhạc nền (BGM)
          </span>
        </label>

        {bgmEnabled && (
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-brand-textMuted" />
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={bgmVolume}
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-brand-surface rounded-lg appearance-none cursor-pointer accent-brand-primary"
              title="BGM Volume"
            />
          </div>
        )}
      </div>
    </div>
  );
};
