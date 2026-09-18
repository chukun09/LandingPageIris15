import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, Plus, Settings, Heart, Calendar, MessageSquare, ChevronRight, X, Download, Music2, Tv, MapPin } from 'lucide-react';
import { MosaicSkeleton } from './components/MosaicSkeleton';
import { useLazyOnVisible } from './hooks/useLazyOnVisible';
import { PodcastPlayer } from './components/PodcastPlayer';
import { MemoryWall } from './components/MemoryWall';
import { UploadModal } from './components/UploadModal';
import { AdminPanel } from './components/AdminPanel';
import { AdminPasswordModal } from './components/AdminPasswordModal';
import { BackdropViewerModal } from './components/BackdropViewerModal';
import { ProofFrame } from './components/ProofFrame';
import { ModalShell } from './components/ModalShell';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './context/ThemeContext';
import { fadeUp, staggerContainer, sectionViewport } from './lib/motion';
import { CelebrationConfetti, fireCelebration } from './components/CelebrationConfetti';
import { GalaCountdown } from './components/GalaCountdown';
import { JourneyTimeline } from './components/JourneyTimeline';
import { DepartmentLeaderboard } from './components/DepartmentLeaderboard';
import { MemoryCardExportModal } from './components/MemoryCardExportModal';
import { GalaStageMode } from './components/GalaStageMode';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
}

interface Podcast {
  id: number;
  postId: number;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  createdAt: string;
}

interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

// three + fiber + drei + postprocessing nằm trong chunk riêng, chỉ tải khi
// người dùng sắp cuộn tới khu vực 3D (hoặc khi trang đã rảnh).
const importGrid3D = () => import('./components/Grid3D');
const Grid3D = lazy(() => importGrid3D().then((m) => ({ default: m.Grid3D })));

function App() {
  const { theme } = useTheme();

  // Lists
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);

  // Selected states
  const [currentPodcastIndex, setCurrentPodcastIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePostDetail, setActivePostDetail] = useState<Post | null>(null);
  const [voteAnimKey, setVoteAnimKey] = useState(0);

  // Target Post for 3D locate
  const [targetPostId, setTargetPostId] = useState<number | null>(null);
  const [isStageModeOpen, setIsStageModeOpen] = useState(false);
  const [exportPostCard, setExportPostCard] = useState<Post | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');

  // Modal open states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isBackdropViewerOpen, setIsBackdropViewerOpen] = useState(false);

  // Notification Toast state
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Hoãn mount khu vực 3D cho tới khi nó sắp lọt vào khung nhìn.
  const { ref: mosaicRef, visible: mosaicVisible } = useLazyOnVisible<HTMLDivElement>({
    prefetch: importGrid3D,
  });

  // Tham chiếu ổn định để Grid3D không phải render lại theo mọi thay đổi state của App.
  const handleCellClick = useCallback((post: Post) => setActivePostDetail(post), []);

  const fetchData = async () => {
    try {
      const postsRes = await fetch('/api/posts');
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setApprovedPosts(postsData);
      }

      const podcastsRes = await fetch('/api/podcasts');
      if (podcastsRes.ok) {
        const podcastsData = await podcastsRes.json();
        setPodcasts(podcastsData);
        if (podcastsData.length > 0 && currentPodcastIndex === -1) {
          setCurrentPodcastIndex(0);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ API:', err);
    }
  };

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/admin/posts/pending');
      if (res.ok) {
        const data = await res.json();
        setPendingPosts(data);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách chờ duyệt:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isAdminPanelOpen) {
      fetchPending();
    }
  }, [isAdminPanelOpen]);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleVote = async (id: number) => {
    try {
      const res = await fetch(`/api/posts/${id}/vote`, { method: 'POST' });
      if (res.ok) {
        setApprovedPosts(prev =>
          prev.map(p => p.id === id ? { ...p, voteCount: p.voteCount + 1 } : p)
        );
        if (activePostDetail && activePostDetail.id === id) {
          setActivePostDetail(prev => prev ? { ...prev, voteCount: prev.voteCount + 1 } : null);
          setVoteAnimKey(k => k + 1);
        }
        fireCelebration();
        triggerToast('Cảm ơn bạn đã thả tim bình chọn!', 'success');
      } else {
        triggerToast('Lỗi khi bình chọn.', 'error');
      }
    } catch {
      triggerToast('Không thể kết nối đến máy chủ.', 'error');
    }
  };

  const handleUploadSubmit = async (message: string, department: string, file: File): Promise<boolean> => {
    const formData = new FormData();
    formData.append('message', message);
    if (department) formData.append('department', department);
    formData.append('file', file);

    try {
      const res = await fetch('/api/posts', { method: 'POST', body: formData });
      if (res.ok) {
        fireCelebration();
        triggerToast('Tải lên thành công! Kỷ niệm đang xếp hàng chờ duyệt.', 'info');
        fetchPending();
        return true;
      } else {
        const errText = await res.text();
        triggerToast(errText || 'Tải lên thất bại. Vui lòng kiểm tra lại.', 'error');
        return false;
      }
    } catch {
      triggerToast('Không thể kết nối đến máy chủ để tải lên.', 'error');
      return false;
    }
  };

  const handleApprovePost = async (id: number, approve: boolean) => {
    try {
      const res = await fetch(`/api/admin/posts/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      if (res.ok) {
        triggerToast(approve ? 'Đã duyệt đăng kỷ niệm thành công!' : 'Đã xóa bài viết khỏi hàng đợi.');
        fetchPending();
        fetchData();
      } else {
        triggerToast('Thao tác admin thất bại.', 'error');
      }
    } catch {
      triggerToast('Lỗi mạng kết nối.', 'error');
    }
  };

  const handleGeneratePodcast = async (id: number, title: string, apiKey: string, region: string) => {
    const res = await fetch(`/api/admin/posts/${id}/podcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, apiKey, region }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Thất bại khi yêu cầu máy chủ tạo âm thanh.');
    }
    fetchData();
  };

  const handleDeletePodcast = async (id: number) => {
    const res = await fetch(`/api/admin/podcasts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Thất bại khi xóa số phát thanh Podcast.');
    }
    triggerToast('Đã xóa số phát thanh thành công!');
    fetchData();
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
    <div className="min-h-screen bg-brand-bg text-brand-textPrimary flex flex-col font-sans relative antialiased">
      {/* Mặt bàn soi phim: một lớp lưới kẻ tĩnh, thay cho ba khối gradient bị làm
          mờ 110px trước đây — mỗi khối đó tốn ~28 MB bộ nhớ hợp thành ở DPR 2 và
          là nguyên nhân chính khiến Safari trên iPhone giết ngữ cảnh WebGL. */}
      <div className="fixed inset-0 light-table-grid opacity-60 dark:opacity-25 pointer-events-none z-0" aria-hidden />

      {/* Sticky Header */}
      <header className="sticky top-0 bg-brand-card/70 backdrop-blur-xl border-b border-brand-border/70 dark:border-brand-secondary/15 shadow-sm z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="dark:bg-white/90 dark:rounded-xl dark:px-2 dark:py-1">
              <img
                src="/LOGO 15th IRIS - FINAL _LOGO 15th IRIS - CHOT2.png"
                alt="15th IRIS Logo"
                className="h-10 w-auto object-contain"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <motion.button
              onClick={() => setIsStageModeOpen(true)}
              className="flex items-center gap-1.5 bg-brand-surface hover:bg-brand-surfaceHover border border-brand-secondary/40 text-brand-secondary font-bold text-xs px-3 py-2.5 rounded-xl active:scale-95 transition-all shadow-sm"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.94 }}
              title="Bật chế độ trình chiếu toàn màn hình cho màn LED sân khấu"
            >
              <Tv className="w-4 h-4 text-amber-500" /> <span className="hidden sm:inline">Chế độ Sân khấu</span>
            </motion.button>
            <motion.button
              onClick={() => setIsUploadModalOpen(true)}
              className="btn-gold flex items-center gap-1.5 text-xs px-4 py-2.5 shadow-md"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.94 }}
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Gửi kỷ niệm</span>
            </motion.button>
            <motion.button
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-1.5 bg-brand-surface hover:bg-brand-surfaceHover border border-brand-border text-brand-textSecondary hover:text-brand-textPrimary font-bold text-xs px-3 py-2.5 rounded-xl active:scale-95 transition-all"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.94 }}
            >
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Quản trị</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl w-full mx-auto px-6 py-10 flex-1 space-y-12 z-10">

        {/* Hero & Bức tường 3D chính */}
        <motion.section
          className="space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-secondary/15 border border-brand-secondary/30 text-brand-secondary font-mono text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>2011 — 2026 · ĐẠI LỄ KỶ NIỆM 15 NĂM IRIS</span>
              </div>
              <h1 className="font-display text-[1.8rem] sm:text-[2.5rem] md:text-[2.9rem] leading-[1.08] font-extrabold text-brand-textPrimary">
                15 Năm Dệt Nên Kỳ Tích — <span className="gradient-text-gold">Bức Tường Kỷ Niệm Vàng</span>
              </h1>
              <p className="text-xs sm:text-sm text-brand-textSecondary max-w-2xl leading-relaxed">
                Mỗi bức ảnh là một mốc son tự hào, mỗi lời chúc là một tia sáng cùng thắp lên biểu tượng IRIS 15 năm kiên định và vươn xa.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-2 text-[11px] font-mono text-brand-textMuted">
                <span className="px-2.5 py-1 rounded-lg bg-brand-surface border border-brand-border">
                  ✨ 15 Năm Hành Trình
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-brand-surface border border-brand-border font-bold text-brand-secondary">
                  🌟 {approvedPosts.length} Mảnh Ghép Đã Duyệt
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-brand-surface border border-brand-border">
                  ❤️ 100% Tự Hào Đồng Hành
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <motion.button
                onClick={() => setIsUploadModalOpen(true)}
                className="btn-gold text-xs px-4 py-2.5 flex items-center gap-1.5 shadow-md"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-4 h-4" /> Gửi ảnh của bạn
              </motion.button>
              <button
                onClick={() => setIsBackdropViewerOpen(true)}
                className="text-[11px] font-semibold text-brand-textSecondary hover:text-brand-textPrimary border border-brand-border hover:border-brand-secondary/50 px-3.5 py-2.5 rounded-md transition-colors bg-brand-card"
              >
                Xem bản bông in
              </button>
              <button
                onClick={() => setIsStageModeOpen(true)}
                className="text-[11px] font-semibold text-amber-500 hover:text-amber-400 border border-amber-500/40 hover:border-amber-400 px-3.5 py-2.5 rounded-md transition-colors bg-brand-card flex items-center gap-1.5"
                title="Chiếu toàn màn hình cho màn LED sân khấu sự kiện"
              >
                <Tv className="w-3.5 h-3.5" /> Sân khấu Gala
              </button>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} ref={mosaicRef}>
            <ProofFrame
              slug="IRIS15_BACKDROP · BẢN BÔNG"
              spec={`${approvedPosts.length} ảnh đã duyệt · Xếp chữ IRIS 15`}
            >
              {mosaicVisible ? (
                <Suspense fallback={<MosaicSkeleton />}>
                  <Grid3D
                    approvedPosts={approvedPosts}
                    onCellClick={handleCellClick}
                    theme={theme}
                    targetPostId={targetPostId}
                    onClearTarget={() => setTargetPostId(null)}
                  />
                </Suspense>
              ) : (
                <MosaicSkeleton />
              )}
            </ProofFrame>
          </motion.div>
        </motion.section>

        {/* Gala Countdown Widget */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={sectionViewport}
        >
          <GalaCountdown />
        </motion.section>

        {/* 15-Year Journey Timeline */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={sectionViewport}
        >
          <JourneyTimeline />
        </motion.section>

        {/* Department Constellation Leaderboard */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={sectionViewport}
        >
          <DepartmentLeaderboard
            posts={approvedPosts}
            selectedDepartment={selectedDepartment}
            onSelectDepartment={setSelectedDepartment}
          />
        </motion.section>

        {/* 2-Column: Player & Playlists + Memory Wall */}
        <motion.section
          className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-4"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={sectionViewport}
        >
          {/* Left: Radio Player */}
          <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h2 className="text-base font-black text-brand-textPrimary flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brand-secondary" /> Radio IRIS 15
              </h2>
            </div>

            <PodcastPlayer
              podcasts={podcasts}
              currentPodcastIndex={currentPodcastIndex}
              onSelectPodcast={(idx) => {
                setCurrentPodcastIndex(idx);
                setIsPlaying(true);
              }}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
            />

            {/* Playlist track listing */}
            <div className="glass-card p-6">
              <span className="block text-xs font-bold text-brand-textSecondary mb-3">Số phát sóng hàng ngày</span>
              {podcasts.length === 0 ? (
                <p className="text-[11px] text-brand-textMuted italic">Chưa có số Radio phát sóng nào được tạo.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                  {podcasts.map((pod, idx) => (
                    <motion.div
                      key={pod.id}
                      layout
                      onClick={() => {
                        setCurrentPodcastIndex(idx);
                        setIsPlaying(true);
                      }}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        currentPodcastIndex === idx
                          ? 'bg-brand-primary/15 border-brand-primary/45 text-brand-primary font-bold shadow-sm dark:shadow-glow-primary'
                          : 'bg-brand-surface/60 border-brand-border hover:bg-brand-surfaceHover hover:border-brand-border text-brand-textSecondary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {currentPodcastIndex === idx && isPlaying ? (
                          <span className="flex items-end gap-[2px] h-4 shrink-0">
                            {[0, 1, 2].map(i => (
                              <span
                                key={i}
                                className="w-[3px] bg-brand-primary rounded-sm animate-bounce"
                                style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }}
                              />
                            ))}
                          </span>
                        ) : (
                          <Music2 className="w-3.5 h-3.5 shrink-0 text-brand-textMuted" />
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-xs font-bold truncate block" title={pod.title}>{pod.title}</span>
                          <span className="text-[10px] text-brand-textMuted font-fira">
                            {Math.floor(pod.durationSeconds / 60)}:{String(pod.durationSeconds % 60).padStart(2, '0')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(pod.audioUrl, pod.title);
                          }}
                          className="p-1.5 rounded-lg hover:bg-brand-surfaceHover text-brand-textSecondary hover:text-brand-primary active:scale-95 transition-all"
                          title="Tải xuống"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 shrink-0 text-brand-textMuted" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Memory Wall */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h2 className="text-base font-black text-brand-textPrimary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-secondary" /> Mảnh Ghép Lời Chúc
              </h2>
            </div>
            <MemoryWall
              posts={approvedPosts}
              onVote={handleVote}
              onCardClick={(post) => setActivePostDetail(post)}
              onExportCard={(post) => setExportPostCard(post)}
              onLocatePost={(post) => {
                setTargetPostId(post.id);
                mosaicRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              selectedDepartment={selectedDepartment}
            />
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border bg-brand-bgDeep/60 backdrop-blur py-8 text-center text-xs text-brand-textSecondary z-10">
        <div className="max-w-7xl mx-auto px-6 space-y-2">
          <p className="font-bold gradient-text-gold text-sm">IRIS 15 Years — Tự Hào Chặng Đường Vàng</p>
          <p className="text-[10px] text-brand-textMuted font-fira">© 2026 IRIS Corporation. All rights reserved.</p>
        </div>
      </footer>

      {/* Detail Modal */}
      <ModalShell
        isOpen={!!activePostDetail}
        onClose={() => setActivePostDetail(null)}
        maxWidth="max-w-lg"
      >
        {activePostDetail && (
          <div className="p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
            <button
              onClick={() => setActivePostDetail(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image viewport with border-glow on dark */}
            <div className="w-full aspect-video bg-brand-surface border border-brand-border/60 dark:border-brand-secondary/15 rounded-2xl overflow-hidden mt-4 shadow-sm">
              <img
                src={activePostDetail.thumbnailUrl || activePostDetail.thumbnailImagePath}
                alt="Memory Detail"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) parent.style.backgroundColor = 'transparent';
                }}
              />
            </div>

            {/* Modern quote layout */}
            <div className="bg-brand-surface/40 border border-brand-border/60 rounded-2xl p-5 relative select-none">
              <span className="absolute -top-3 -left-1 text-5xl text-brand-secondary/20 font-serif">“</span>
              <p className="text-xs md:text-sm text-brand-textPrimary leading-relaxed whitespace-pre-line italic relative z-10 pl-2">
                {activePostDetail.message}
              </p>
            </div>

            {/* Metadata and action buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-brand-border/60">
              <div className="flex flex-col items-start gap-1">
                <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary dark:bg-brand-secondary/15 dark:text-brand-secondary">
                  {activePostDetail.department || 'Ẩn danh'}
                </span>
                <span className="text-[10px] text-brand-textMuted font-fira flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" /> {new Date(activePostDetail.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExportPostCard(activePostDetail)}
                  className="flex items-center gap-1.5 bg-brand-surface hover:bg-brand-surfaceHover border border-brand-secondary/40 text-brand-secondary font-bold px-3 py-2 rounded-full text-xs transition-colors"
                  title="Tải thiệp lưu niệm cá nhân để chia sẻ"
                >
                  <Download className="w-3.5 h-3.5" /> Thiệp lưu niệm
                </button>

                <button
                  onClick={() => {
                    setTargetPostId(activePostDetail.id);
                    setActivePostDetail(null);
                    mosaicRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-white border border-amber-500/40 text-amber-400 font-bold px-3 py-2 rounded-full text-xs transition-colors"
                  title="Tìm vị trí trên chữ IRIS 15"
                >
                  <MapPin className="w-3.5 h-3.5" /> Xem trên 3D
                </button>

                <div className="relative">
                  <AnimatePresence>
                    <motion.span
                      key={voteAnimKey}
                      className="absolute -top-6 left-1/2 -translate-x-1/2 text-brand-danger pointer-events-none text-base"
                      initial={{ opacity: 1, y: 0 }}
                      animate={{ opacity: 0, y: -28 }}
                      exit={{}}
                      transition={{ duration: 0.7 }}
                    >
                      ❤️
                    </motion.span>
                  </AnimatePresence>
                  <motion.button
                    onClick={() => handleVote(activePostDetail.id)}
                    className="flex items-center gap-1.5 bg-brand-danger/5 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger font-bold px-4 py-2 rounded-full text-xs transition-all duration-300 shadow-sm"
                    whileTap={{ scale: 0.85 }}
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" /> Thích <span className="font-fira font-bold ml-0.5">{activePostDetail.voteCount}</span>
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSubmit={handleUploadSubmit}
      />

      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        pendingPosts={pendingPosts}
        approvedPosts={approvedPosts}
        podcasts={podcasts}
        onApprove={handleApprovePost}
        onGeneratePodcast={handleGeneratePodcast}
        onDeletePodcast={handleDeletePodcast}
        onOpenBackdropViewer={() => setIsBackdropViewerOpen(true)}
      />

      <BackdropViewerModal
        isOpen={isBackdropViewerOpen}
        onClose={() => setIsBackdropViewerOpen(false)}
      />

      <AdminPasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => setIsAdminPanelOpen(true)}
      />

      {/* Hiệu ứng Pháo hoa Confetti toàn màn hình */}
      <CelebrationConfetti />

      {/* Modal xuất thiệp kỷ niệm cá nhân */}
      <MemoryCardExportModal
        isOpen={!!exportPostCard}
        post={exportPostCard}
        onClose={() => setExportPostCard(null)}
      />

      {/* Chế độ Sân khấu Gala Presentation Mode */}
      <GalaStageMode
        isOpen={isStageModeOpen}
        posts={approvedPosts}
        onClose={() => setIsStageModeOpen(false)}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.message + toast.type}
            className="fixed bottom-6 right-6 z-50"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className={`glass-card px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold border ${
              toast.type === 'success'
                ? 'border-brand-success/30 text-brand-success'
                : toast.type === 'error'
                  ? 'border-brand-danger/30 text-brand-danger'
                  : 'border-brand-primary/30 text-brand-primary'
            }`}>
              <div className="w-2 h-2 rounded-full bg-current animate-ping" />
              <span>{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
