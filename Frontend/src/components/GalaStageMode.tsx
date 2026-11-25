import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  animate,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';
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

// ── Nhịp trình chiếu ─────────────────────────────────────────────────────────
const BASE_SLIDE_MS = 7000; // slide thường: 7 giây
const MAX_SLIDE_MS = 30000; // lời chúc rất dài cũng không giữ quá 30 giây
const SCROLL_LEAD_MS = 2500; // chờ trước khi chữ bắt đầu chạy (gồm ~0,8s thẻ hiện lên)
const SCROLL_TAIL_MS = 2500; // dừng ở cuối để đọc nốt trước khi sang slide
const SECONDS_PER_LINE = 1.3; // tốc độ cuộn tính theo chiều cao dòng → tự co giãn theo cỡ chữ/màn hình
const MIN_PX_PER_SEC = 14;
const MAX_PX_PER_SEC = 34;
const MIN_SCROLL_PX = 6; // tràn vài pixel thì không đáng cuộn

interface ScrollPlan {
  distance: number; // số pixel cần cuộn (0 = chữ vừa khung)
  scrollMs: number;
  totalMs: number; // thời lượng cả slide
}

const NO_SCROLL: ScrollPlan = { distance: 0, scrollMs: 0, totalMs: BASE_SLIDE_MS };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Tính quãng cuộn và thời lượng slide từ phần chữ bị tràn. */
function planScroll(distance: number, lineHeightPx: number): ScrollPlan {
  if (distance < MIN_SCROLL_PX) return NO_SCROLL;

  const pxPerSec = clamp(lineHeightPx / SECONDS_PER_LINE, MIN_PX_PER_SEC, MAX_PX_PER_SEC);
  // Vượt trần 30 giây thì chạy nhanh hơn một chút để vẫn hiện đủ chữ
  const scrollMs = Math.min((distance / pxPerSec) * 1000, MAX_SLIDE_MS - SCROLL_LEAD_MS - SCROLL_TAIL_MS);
  const totalMs = Math.max(BASE_SLIDE_MS, SCROLL_LEAD_MS + scrollMs + SCROLL_TAIL_MS);
  return { distance, scrollMs, totalMs };
}

/**
 * Vận tốc hình thang: tăng tốc êm ở đầu, đều ở giữa, hãm êm ở cuối —
 * tránh cảm giác chữ "giật" khi bắt đầu/dừng như easing tuyến tính.
 */
function easeScroll(p: number): number {
  const r = 0.12;
  const vMax = 1 / (1 - r);
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < r) return (vMax * p * p) / (2 * r);
  if (p > 1 - r) return 1 - (vMax * (1 - p) * (1 - p)) / (2 * r);
  return vMax * (p - r / 2);
}

/**
 * MotionValue dẫn xuất từ đồng hồ slide, cập nhật ngoài vòng render của React
 * (không re-render mỗi khung hình). `frozen` = giữ nguyên giá trị cuối, dùng cho
 * thẻ đang chạy hiệu ứng thoát để không bị giật về đầu khi đồng hồ đặt lại.
 */
function useClockMotion(clock: MotionValue<number>, map: (t: number) => number, frozen = false) {
  const out = useMotionValue(map(clock.get()));
  useEffect(() => {
    if (frozen) return;
    const apply = (t: number) => out.set(map(t));
    apply(clock.get());
    return clock.on('change', apply);
  }, [clock, map, frozen, out]);
  return out;
}

/** Ảnh chính với hiệu ứng Ken Burns chạy theo đồng hồ slide (tạm dừng là dừng theo). */
const KenBurnsImage: React.FC<{ src: string; clock: MotionValue<number>; slideMs: number }> = ({ src, clock, slideMs }) => {
  const isPresent = useIsPresent();
  const toScale = useCallback((t: number) => 1 + 0.05 * Math.min(1, t / slideMs), [slideMs]);
  const scale = useClockMotion(clock, toScale, !isPresent);

  return (
    <motion.img
      src={src}
      alt="Kỷ niệm"
      className="w-full h-full object-contain relative z-10 drop-shadow-md will-change-transform"
      style={{ scale }}
      decoding="async"
      // Ảnh lỗi thì ẩn đi, chừa nền xám thay vì icon ảnh vỡ trên màn LED
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
};

/**
 * Lời chúc tự cuộn khi dài hơn khung. Đo phần tràn bằng ResizeObserver, báo
 * thời lượng cần thiết lên trên qua `onPlan`, và dịch chữ bằng transform
 * (chạy trên GPU, không gây reflow) theo đúng đồng hồ của slide.
 */
const ScrollingMessage: React.FC<{
  message: string;
  clock: MotionValue<number>;
  onPlan: (plan: ScrollPlan) => void;
}> = ({ message, clock, onPlan }) => {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [plan, setPlan] = useState<ScrollPlan>(NO_SCROLL);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const text = textRef.current;
    if (!viewport || !content || !text) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      // offsetHeight không bị ảnh hưởng bởi transform đang cuộn
      const distance = Math.max(0, Math.ceil(content.offsetHeight - viewport.clientHeight));
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 28;
      const next = planScroll(distance, lineHeight);
      setPlan((prev) =>
        prev.distance === next.distance && prev.totalMs === next.totalMs ? prev : next,
      );
    };

    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(content);
    // Font web nạp xong thì chiều cao dòng đổi → đo lại
    document.fonts?.ready.then(measure);
    measure();

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [message]);

  // Thẻ đang thoát không được báo thời lượng, tránh ghi đè slide mới
  useEffect(() => {
    if (isPresent) onPlan(plan);
  }, [plan, isPresent, onPlan]);

  const autoScroll = plan.distance > 0 && !reduceMotion;
  const toOffset = useCallback(
    (t: number) =>
      autoScroll ? -plan.distance * easeScroll((t - SCROLL_LEAD_MS) / plan.scrollMs) : 0,
    [autoScroll, plan],
  );
  const y = useClockMotion(clock, toOffset, !isPresent);

  // Mờ dần mép trên/dưới để chữ trôi vào/ra mềm, không bị cắt cứng
  const fadeMask = autoScroll
    ? 'linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 44px), transparent 100%)'
    : undefined;

  return (
    <div
      ref={viewportRef}
      className={`relative flex-1 min-h-0 max-h-[34vh] sm:max-h-[42vh] md:max-h-[44vh] pr-2 ${
        reduceMotion ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'
      }`}
      style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
    >
      <motion.div
        ref={contentRef}
        className={`relative ${autoScroll ? 'pb-12 will-change-transform' : ''}`}
        style={{ y }}
      >
        <span className="absolute top-0 -left-1 text-6xl sm:text-7xl leading-none text-amber-300/70 font-serif select-none pointer-events-none">“</span>
        <p
          ref={textRef}
          className={`relative pt-6 sm:pt-8 text-stone-700 leading-relaxed whitespace-pre-line break-words ${
            message.length > 350
              ? 'text-sm sm:text-base md:text-lg'
              : message.length > 180
                ? 'text-base sm:text-lg md:text-xl'
                : 'text-base sm:text-xl md:text-2xl font-medium'
          }`}
        >
          {message}
        </p>
      </motion.div>
    </div>
  );
};

export const GalaStageMode: React.FC<GalaStageModeProps> = ({ posts, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  // Tăng mỗi lần chuyển slide: kể cả khi chỉ có 1 bài vẫn bắt đầu lượt mới
  const [cycle, setCycle] = useState(0);
  const [slideMs, setSlideMs] = useState(BASE_SLIDE_MS);
  // Slide mới chỉ bắt đầu đếm giờ khi thẻ đã hiện và đo xong lời chúc — tránh
  // đếm trong lúc thẻ cũ đang thoát rồi thanh tiến trình giật lùi khi biết thời lượng thật
  const [planReady, setPlanReady] = useState(false);

  // Danh sách xếp bài mới lên đầu: BTC duyệt thêm bài trong lúc chiếu sẽ đẩy lệch
  // chỉ số → bám theo id bài đang chiếu để slide không bị nhảy sang bài khác giữa chừng
  const [prevPosts, setPrevPosts] = useState(posts);
  if (prevPosts !== posts) {
    setPrevPosts(posts);
    const showingId = prevPosts.length > 0 ? prevPosts[currentIndex % prevPosts.length]?.id : undefined;
    const sameIdIndex = posts.findIndex((p) => p.id === showingId);
    if (sameIdIndex >= 0 && sameIdIndex !== currentIndex) setCurrentIndex(sameIdIndex);
  }

  // Danh sách có thể co lại khi BTC gỡ bài trong lúc đang chiếu: chia lấy dư để không rơi ra ngoài mảng
  const safeIndex = posts.length > 0 ? currentIndex % posts.length : 0;
  const activePost = posts[safeIndex] || null;
  const slideKey = `${activePost?.id ?? 'none'}-${cycle}`;

  // Sang slide mới thì về thời lượng mặc định ngay trong lúc render, trước khi
  // lời chúc của slide mới đo xong và báo thời lượng thật
  const [prevSlideKey, setPrevSlideKey] = useState(slideKey);
  if (prevSlideKey !== slideKey) {
    setPrevSlideKey(slideKey);
    setSlideMs(BASE_SLIDE_MS);
    setPlanReady(false);
  }

  const getPostImageUrl = (post: Post | null): string => {
    if (!post) return '';
    return post.previewUrl || `/api/posts/${post.id}/preview`;
  };

  const goTo = useCallback(
    (delta: number) => {
      if (posts.length === 0) return;
      setCurrentIndex((p) => (p + delta + posts.length) % posts.length);
      setCycle((c) => c + 1);
    },
    [posts.length],
  );

  const handlePlan = useCallback((plan: ScrollPlan) => {
    setSlideMs(plan.totalMs);
    setPlanReady(true);
  }, []);

  // Đồng hồ duy nhất của slide (mili-giây đã trôi). Thanh tiến trình, Ken Burns
  // và chữ cuộn đều đọc từ đây nên luôn khớp nhau; tạm dừng là dừng tất cả tại chỗ.
  const clock = useMotionValue(0);
  const clockSlideRef = useRef(slideKey);
  const isVisible = isOpen && posts.length > 0;

  useEffect(() => {
    if (clockSlideRef.current !== slideKey) {
      clockSlideRef.current = slideKey;
      clock.set(0);
    }
    if (!isVisible || !isPlaying || !planReady) return;

    // Thời lượng đổi giữa chừng (vừa đo xong chữ, đổi cỡ màn hình) thì chạy tiếp
    // từ vị trí hiện tại tới mốc mới, không đếm lại từ đầu
    const remaining = Math.max(0, slideMs - clock.get());
    const controls = animate(clock, slideMs, {
      duration: remaining / 1000,
      ease: 'linear',
      onComplete: () => goTo(1),
    });
    return () => controls.stop();
  }, [clock, slideKey, slideMs, planReady, isVisible, isPlaying, goTo]);

  const toProgress = useCallback((t: number) => Math.min(1, t / slideMs), [slideMs]);
  const progress = useClockMotion(clock, toProgress);

  // Ẩn con trỏ chuột sau 2,5 giây không di chuyển để không nằm giữa màn LED
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    if (!isVisible) return;
    let timer = window.setTimeout(() => setCursorHidden(true), 2500);
    const handleMove = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 2500);
    };
    window.addEventListener('mousemove', handleMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', handleMove);
    };
  }, [isVisible]);

  // Khoá cuộn trang phía sau khi đang trình chiếu (chỉ khi thực sự có slide hiển thị)
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
      if (e.key === 'ArrowRight') goTo(1);
      if (e.key === 'ArrowLeft') goTo(-1);
      if (e.key === ' ') setIsPlaying((p) => !p);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, goTo, onClose]);

  if (!isOpen || posts.length === 0) return null;

  const message = (activePost?.message ?? '').normalize('NFC');

  // Bảng màu sáng cố định (không theo toggle sáng/tối của trang): nền giấy ngà,
  // chữ nâu than, điểm nhấn vàng champagne — dễ đọc trên màn LED hội trường.
  return (
    <div className={`fixed inset-0 z-50 bg-[#FAF7F1] text-stone-900 flex flex-col justify-between overflow-hidden select-none ${cursorHidden ? 'cursor-none' : ''}`}>
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
            <source srcSet="/brand/logo-original-h480.webp" type="image/webp" />
            <img
              src="/brand/logo-original-h480.png"
              alt="15th IRIS"
              width={610}
              height={480}
              className="h-8 sm:h-11 md:h-14 w-auto object-contain"
            />
          </picture>
          <div className="h-8 sm:h-10 w-px bg-gradient-to-b from-transparent via-amber-400/70 to-transparent shrink-0 hidden sm:block" />
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[11px] font-mono tracking-[0.2em] text-amber-700 font-semibold uppercase hidden sm:block">
              Chế độ sân khấu · Kỷ niệm 15 năm thành lập
            </span>
            <h1 className="text-sm sm:text-lg md:text-2xl font-black text-stone-900 leading-tight truncate">
              Cùng Viết Tiếp Hành Trình
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
            aria-label="Thoát chế độ sân khấu"
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
              key={slideKey}
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
                <KenBurnsImage src={getPostImageUrl(activePost)} clock={clock} slideMs={slideMs} />
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

                <ScrollingMessage message={message} clock={clock} onPlan={handlePlan} />

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
            onClick={() => goTo(-1)}
            className="p-2.5 sm:p-3 rounded-full bg-white ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 text-stone-700 transition-colors"
            title="Trước"
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? 'Tạm dừng trình chiếu' : 'Tiếp tục trình chiếu'}
            className="px-3 py-2.5 sm:px-5 sm:py-3 rounded-full bg-amber-600 text-white hover:bg-amber-500 font-bold transition-colors flex items-center gap-2 shadow-md shadow-amber-600/25"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span className="text-xs font-mono tracking-wider hidden sm:inline">
              {isPlaying ? 'TẠM DỪNG' : 'TIẾP TỤC'}
            </span>
          </button>
          <button
            onClick={() => goTo(1)}
            className="p-2.5 sm:p-3 rounded-full bg-white ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 text-stone-700 transition-colors"
            title="Sau"
            aria-label="Ảnh sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh tiến trình: scaleX theo đồng hồ slide (transform, không reflow);
            tạm dừng thì đứng yên tại chỗ, chạy tiếp thì đi nốt phần còn lại */}
        <div className="hidden md:flex flex-1 max-w-md mx-8 items-center gap-3">
          <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full w-full origin-left bg-gradient-to-r from-amber-400 to-amber-600 will-change-transform"
              style={{ scaleX: progress }}
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
