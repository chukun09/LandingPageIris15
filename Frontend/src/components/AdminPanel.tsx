import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Check,
  Trash2,
  Image,
  Settings,
  Sparkles,
  Download,
  Radio,
  Pin,
  PinOff,
  Search,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { ModalShell } from './ModalShell';
import { PodcastStudioTab } from './PodcastStudioTab';

interface PendingPost {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
  isPinned?: boolean;
}

interface Podcast {
  id: number;
  postId: number;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  createdAt: string;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pendingPosts: PendingPost[];
  approvedPosts: PendingPost[];
  podcasts: Podcast[];
  onApprove: (id: number, approve: boolean) => Promise<void>;
  onTogglePin?: (id: number, isPinned?: boolean) => Promise<void>;
  onGeneratePodcast: (id: number, title: string, apiKey: string, region: string) => Promise<void>;
  onUploadPodcast: (formData: FormData) => Promise<void>;
  onDeletePodcast: (id: number) => Promise<void>;
  onOpenBackdropViewer?: () => void;
}

type MainTab = 'posts' | 'podcasts' | 'backdrop';
type PostsSubTab = 'pending' | 'approved';
type PodcastSubTab = 'studio' | 'list' | 'config';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  pendingPosts,
  approvedPosts,
  podcasts,
  onApprove,
  onTogglePin,
  onGeneratePodcast,
  onUploadPodcast,
  onDeletePodcast,
  onOpenBackdropViewer,
}) => {
  const [mainTab, setMainTab] = useState<MainTab>('posts');
  const [postsSubTab, setPostsSubTab] = useState<PostsSubTab>('pending');
  const [podcastSubTab, setPodcastSubTab] = useState<PodcastSubTab>('studio');

  const [ttsApiKey, setTtsApiKey] = useState(() => localStorage.getItem('tts_api_key') || '');
  const [ttsRegion, setTtsRegion] = useState(() => localStorage.getItem('tts_region') || 'eastasia');
  const [loadingPosts, setLoadingPosts] = useState<Record<number, boolean>>({});
  const [pinningPostId, setPinningPostId] = useState<number | null>(null);
  const [approvedSearch, setApprovedSearch] = useState('');
  const [realDurations, setRealDurations] = useState<Record<number, number>>({});

  useEffect(() => {
    podcasts.forEach((p) => {
      if (p.audioUrl && !realDurations[p.id]) {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = p.audioUrl;
        audio.onloadedmetadata = () => {
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            const actualSec = Math.round(audio.duration);
            if (actualSec > 0) {
              setRealDurations((prev) => ({ ...prev, [p.id]: actualSec }));
            }
          }
        };
      }
    });
  }, [podcasts, realDurations]);

  const handleTogglePinAction = async (id: number, currentPinned: boolean) => {
    if (!onTogglePin) return;
    setPinningPostId(id);
    try {
      await onTogglePin(id, !currentPinned);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Thao tác ghim bài thất bại.');
    } finally {
      setPinningPostId(null);
    }
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

  const handleDeleteAction = async (id: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa số phát thanh này không?')) return;
    setLoadingPosts((prev) => ({ ...prev, [id]: true }));
    try {
      await onDeletePodcast(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Xóa podcast thất bại.');
    } finally {
      setLoadingPosts((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveConfig = () => {
    localStorage.setItem('tts_api_key', ttsApiKey);
    localStorage.setItem('tts_region', ttsRegion);
    alert('Đã lưu cấu hình dịch vụ Azure Speech thành công!');
  };

  const handleApproveAction = async (id: number, approve: boolean) => {
    setLoadingPosts((prev) => ({ ...prev, [id]: true }));
    try {
      await onApprove(id, approve);
    } catch {
      alert('Thao tác phê duyệt thất bại.');
    } finally {
      setLoadingPosts((prev) => ({ ...prev, [id]: false }));
    }
  };

  const pinnedCount = approvedPosts.filter((p) => p.isPinned).length;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-6xl xl:max-w-7xl">
      <div className="flex flex-col h-[88vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-brand-border flex flex-wrap items-center justify-between gap-y-2 shrink-0 bg-brand-surface/40">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-black text-brand-textPrimary flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-primary shrink-0" /> <span className="truncate">Ban Tổ Chức - Quản Trị Sự Kiện</span>
            </h3>
            <p className="text-xs text-brand-textSecondary mt-0.5 hidden sm:block">
              Duyệt kỷ niệm & ghim bài, sản xuất Radio Podcast AI và quản lý Backdrop in ấn.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenBackdropViewer && (
              <button
                type="button"
                onClick={onOpenBackdropViewer}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-surface hover:bg-brand-surfaceHover border border-brand-border text-brand-textPrimary rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <Image className="w-3.5 h-3.5 text-brand-secondary" />
                <span>Xem Backdrop 2D</span>
                <ExternalLink className="w-3 h-3 text-brand-textMuted" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Primary Module Tabs */}
        <div className="px-4 sm:px-6 bg-brand-surface/75 border-b border-brand-border flex items-center justify-between shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex gap-2 py-2 w-max">
            <button
              onClick={() => setMainTab('posts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                mainTab === 'posts'
                  ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                  : 'text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface'
              }`}
            >
              <FileText className={`w-4 h-4 shrink-0 ${mainTab === 'posts' ? 'text-brand-primary' : 'text-brand-textMuted'}`} />
              <span>Quản Lý Kỷ Niệm</span>
              {pendingPosts.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  {pendingPosts.length} chờ
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-surfaceHover text-brand-textMuted">
                  {approvedPosts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setMainTab('podcasts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                mainTab === 'podcasts'
                  ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                  : 'text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface'
              }`}
            >
              <Radio className={`w-4 h-4 shrink-0 ${mainTab === 'podcasts' ? 'text-brand-secondary' : 'text-brand-textMuted'}`} />
              <span>Radio Podcast AI</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-surfaceHover text-brand-textSecondary">
                {podcasts.length} số
              </span>
            </button>

            <button
              onClick={() => setMainTab('backdrop')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                mainTab === 'backdrop'
                  ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                  : 'text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface'
              }`}
            >
              <Image className={`w-4 h-4 shrink-0 ${mainTab === 'backdrop' ? 'text-brand-primary' : 'text-brand-textMuted'}`} />
              <span>Bản In Backdrop</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-surfaceHover text-brand-textSecondary">
                6×3m
              </span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={mainTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* MODULE 1: POSTS & MEMORIES */}
              {mainTab === 'posts' && (
                <div className="space-y-4">
                  {/* Sub-navigation bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-brand-border">
                    <div className="inline-flex p-1 bg-brand-surface rounded-xl border border-brand-border max-w-full overflow-x-auto custom-scrollbar">
                      <button
                        onClick={() => setPostsSubTab('pending')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          postsSubTab === 'pending'
                            ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                            : 'text-brand-textSecondary hover:text-brand-textPrimary'
                        }`}
                      >
                        <span>Bài chờ duyệt</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            pendingPosts.length > 0
                              ? 'bg-amber-500 text-white'
                              : 'bg-brand-surfaceHover text-brand-textMuted'
                          }`}
                        >
                          {pendingPosts.length}
                        </span>
                      </button>

                      <button
                        onClick={() => setPostsSubTab('approved')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          postsSubTab === 'approved'
                            ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                            : 'text-brand-textSecondary hover:text-brand-textPrimary'
                        }`}
                      >
                        <span>Bài đã duyệt & Ghim</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-surfaceHover text-brand-textSecondary">
                          {approvedPosts.length}
                        </span>
                        {pinnedCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 font-bold ml-0.5">
                            <Pin className="w-2.5 h-2.5 fill-current" />
                            {pinnedCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {postsSubTab === 'approved' && (
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-brand-textSecondary font-medium hidden sm:block">
                          Tổng số: <strong className="text-brand-textPrimary">{approvedPosts.length}</strong> bài • Đang ghim: <strong className="text-amber-500">{pinnedCount}</strong> bài
                        </div>
                        <div className="relative w-64 max-w-full">
                          <Search className="w-3.5 h-3.5 text-brand-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Tìm kiếm nội dung, phòng ban..."
                            value={approvedSearch}
                            onChange={(e) => setApprovedSearch(e.target.value)}
                            className="input-themed w-full pl-8 pr-3 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SubTab: Pending */}
                  {postsSubTab === 'pending' && (
                    pendingPosts.length === 0 ? (
                      <div className="text-center py-20 bg-brand-surface/40 rounded-2xl border border-brand-border space-y-3">
                        <Sparkles className="w-12 h-12 text-brand-textMuted mx-auto" />
                        <p className="text-brand-textSecondary text-sm font-semibold">Tất cả bài viết đã được phê duyệt xong!</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-brand-border rounded-2xl bg-brand-card shadow-sm">
                        <table className="w-full border-collapse text-left text-xs text-brand-textSecondary">
                          <thead>
                            <tr className="bg-brand-surface border-b border-brand-border font-bold text-brand-textPrimary">
                              <th className="p-3.5 w-16 text-center">Ảnh</th>
                              <th className="p-3.5">Lời chúc / Kỷ niệm</th>
                              <th className="p-3.5 w-44">Phòng ban</th>
                              <th className="p-3.5 w-36 min-w-[140px] text-center whitespace-nowrap">Thao tác duyệt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/60">
                            {pendingPosts.map((post) => (
                              <tr key={post.id} className="hover:bg-brand-surface/50 transition-colors">
                                <td className="p-3.5 w-16 text-center align-top">
                                  <img
                                    src={post.thumbnailUrl || post.thumbnailImagePath}
                                    alt="thumb"
                                    className="w-12 h-12 object-cover rounded-lg border border-brand-border mx-auto"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </td>
                                <td className="p-3.5 leading-relaxed font-normal text-brand-textPrimary align-top">
                                  {post.message}
                                </td>
                                <td className="p-3.5 font-bold text-brand-textPrimary whitespace-nowrap align-top">
                                  {post.department || 'Ẩn danh'}
                                </td>
                                <td className="p-3.5 w-36 min-w-[140px] text-center align-top whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleApproveAction(post.id, true)}
                                      disabled={loadingPosts[post.id]}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-success/15 hover:bg-brand-success hover:text-white border border-brand-success/30 text-brand-success rounded-lg font-bold text-xs whitespace-nowrap shrink-0 transition-all"
                                      title="Duyệt đăng bài"
                                    >
                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                      <span>Duyệt</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveAction(post.id, false)}
                                      disabled={loadingPosts[post.id]}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-danger/15 hover:bg-brand-danger hover:text-white border border-brand-danger/30 text-brand-danger rounded-lg font-bold text-xs whitespace-nowrap shrink-0 transition-all"
                                      title="Từ chối & Xóa bài"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>Xóa</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {/* SubTab: Approved */}
                  {postsSubTab === 'approved' && (
                    approvedPosts.length === 0 ? (
                      <div className="text-center py-20 bg-brand-surface/40 rounded-2xl border border-brand-border space-y-3">
                        <Sparkles className="w-12 h-12 text-brand-textMuted mx-auto" />
                        <p className="text-brand-textSecondary text-sm font-semibold">Chưa có bài viết nào được duyệt.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-brand-border rounded-2xl bg-brand-card shadow-sm">
                        <table className="w-full border-collapse text-left text-xs text-brand-textSecondary">
                          <thead>
                            <tr className="bg-brand-surface border-b border-brand-border font-bold text-brand-textPrimary">
                              <th className="p-3.5 w-16 text-center">Ảnh</th>
                              <th className="p-3.5">Lời chúc / Kỷ niệm</th>
                              <th className="p-3.5 w-40">Phòng ban</th>
                              <th className="p-3.5 w-24 text-center whitespace-nowrap">Lượt tim</th>
                              <th className="p-3.5 w-28 text-center whitespace-nowrap">Trạng thái</th>
                              <th className="p-3.5 w-48 min-w-[180px] text-center whitespace-nowrap">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/60">
                            {approvedPosts
                              .filter(
                                (p) =>
                                  !approvedSearch ||
                                  p.message.toLowerCase().includes(approvedSearch.toLowerCase()) ||
                                  (p.department && p.department.toLowerCase().includes(approvedSearch.toLowerCase()))
                              )
                              .map((post) => (
                                <tr key={post.id} className="hover:bg-brand-surface/50 transition-colors">
                                  <td className="p-3.5 w-16 text-center align-top">
                                    <img
                                      src={post.thumbnailUrl || post.thumbnailImagePath}
                                      alt="thumb"
                                      className="w-12 h-12 object-cover rounded-lg border border-brand-border mx-auto"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  </td>
                                  <td className="p-3.5 leading-relaxed font-normal text-brand-textPrimary align-top">
                                    {post.message}
                                  </td>
                                  <td className="p-3.5 font-bold text-brand-textPrimary whitespace-nowrap align-top">
                                    {post.department || 'Ẩn danh'}
                                  </td>
                                  <td className="p-3.5 text-center font-mono font-bold text-brand-secondary align-top whitespace-nowrap">
                                    {post.voteCount}
                                  </td>
                                  <td className="p-3.5 text-center align-top whitespace-nowrap">
                                    {post.isPinned ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                                        <Pin className="w-3 h-3 fill-current shrink-0" />
                                        <span>ĐÃ GHIM</span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-brand-textMuted">Thường</span>
                                    )}
                                  </td>
                                  <td className="p-3.5 w-48 min-w-[180px] text-center align-top whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePinAction(post.id, !!post.isPinned)}
                                        disabled={pinningPostId === post.id}
                                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                                          post.isPinned
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 shadow-sm'
                                            : 'bg-brand-surface border border-brand-border text-brand-textSecondary hover:border-amber-500/60 hover:text-amber-400'
                                        }`}
                                        title={post.isPinned ? 'Bỏ ghim khỏi đầu trang' : 'Ghim bài viết lên đầu trang'}
                                      >
                                        {post.isPinned ? (
                                          <>
                                            <PinOff className="w-3.5 h-3.5 shrink-0" />
                                            <span>Gỡ ghim</span>
                                          </>
                                        ) : (
                                          <>
                                            <Pin className="w-3.5 h-3.5 shrink-0" />
                                            <span>Ghim bài</span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleApproveAction(post.id, false)}
                                        disabled={loadingPosts[post.id]}
                                        className="inline-flex items-center justify-center p-1.5 bg-brand-danger/10 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger rounded-lg transition-all shrink-0"
                                        title="Gỡ duyệt & Xóa bài viết"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* MODULE 2: PODCASTS */}
              {mainTab === 'podcasts' && (
                <div className="space-y-4">
                  {/* Sub-navigation bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-brand-border">
                    <div className="inline-flex p-1 bg-brand-surface rounded-xl border border-brand-border max-w-full overflow-x-auto custom-scrollbar">
                      <button
                        onClick={() => setPodcastSubTab('studio')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          podcastSubTab === 'studio'
                            ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                            : 'text-brand-textSecondary hover:text-brand-textPrimary'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-brand-secondary shrink-0" />
                        <span>Studio Tạo Mới</span>
                      </button>

                      <button
                        onClick={() => setPodcastSubTab('list')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          podcastSubTab === 'list'
                            ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                            : 'text-brand-textSecondary hover:text-brand-textPrimary'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                        <span>Kho Phát Thanh</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-surfaceHover text-brand-textSecondary">
                          {podcasts.length}
                        </span>
                      </button>

                      <button
                        onClick={() => setPodcastSubTab('config')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          podcastSubTab === 'config'
                            ? 'bg-brand-card text-brand-textPrimary shadow-sm border border-brand-border'
                            : 'text-brand-textSecondary hover:text-brand-textPrimary'
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5 shrink-0" />
                        <span>Cấu Hình Voice & API</span>
                      </button>
                    </div>
                  </div>

                  {/* SubTab: Studio */}
                  {podcastSubTab === 'studio' && (
                    <PodcastStudioTab
                      pendingPosts={pendingPosts}
                      approvedPosts={approvedPosts}
                      podcasts={podcasts}
                      onGeneratePodcast={onGeneratePodcast}
                      onUploadPodcast={onUploadPodcast}
                    />
                  )}

                  {/* SubTab: List */}
                  {podcastSubTab === 'list' && (
                    podcasts.length === 0 ? (
                      <div className="text-center py-20 bg-brand-surface/40 rounded-2xl border border-brand-border space-y-3">
                        <Radio className="w-12 h-12 text-brand-textMuted mx-auto" />
                        <p className="text-brand-textSecondary text-sm font-semibold">Chưa có số Radio phát thanh nào được tạo.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-brand-border rounded-2xl bg-brand-card shadow-sm">
                        <table className="w-full border-collapse text-left text-xs text-brand-textSecondary">
                          <thead>
                            <tr className="bg-brand-surface border-b border-brand-border font-bold text-brand-textPrimary">
                              <th className="p-3.5 w-14 text-center">ID</th>
                              <th className="p-3.5">Tiêu đề số phát thanh</th>
                              <th className="p-3.5 w-32 whitespace-nowrap">Thời lượng</th>
                              <th className="p-3.5 w-40 whitespace-nowrap">Ngày tạo</th>
                              <th className="p-3.5 w-28 min-w-[110px] text-center whitespace-nowrap">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/60">
                            {podcasts.map((pod) => (
                              <tr key={pod.id} className="hover:bg-brand-surface/50 transition-colors">
                                <td className="p-3.5 font-bold text-brand-textPrimary text-center">{pod.id}</td>
                                <td className="p-3.5 font-semibold text-brand-textPrimary max-w-sm truncate">{pod.title}</td>
                                <td className="p-3.5 whitespace-nowrap font-mono">
                                  {(() => {
                                    const sec = realDurations[pod.id] || pod.durationSeconds;
                                    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
                                  })()}
                                </td>
                                <td className="p-3.5 whitespace-nowrap text-brand-textSecondary">
                                  {new Date(pod.createdAt).toLocaleDateString('vi-VN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="p-3.5 w-28 min-w-[110px] text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleDownload(pod.audioUrl, pod.title)}
                                      className="inline-flex items-center justify-center p-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/25 text-brand-primary rounded-lg transition-all shrink-0"
                                      title="Tải xuống tệp MP3"
                                    >
                                      <Download className="w-3.5 h-3.5 shrink-0" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAction(pod.id)}
                                      disabled={loadingPosts[pod.id]}
                                      className="inline-flex items-center justify-center p-1.5 bg-brand-danger/10 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger rounded-lg transition-all shrink-0"
                                      title="Xóa Podcast"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {/* SubTab: Config */}
                  {podcastSubTab === 'config' && (
                    <div className="max-w-xl space-y-6">
                      <div className="bg-brand-surface border border-brand-border p-6 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-brand-textPrimary">Cấu hình Động cơ AI TTS (ViXTTS / Azure)</h4>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                            ViXTTS Auto-Fallback
                          </span>
                        </div>
                        <p className="text-xs text-brand-textSecondary leading-relaxed">
                          Hệ thống hỗ trợ tạo giọng đọc tự động bằng <strong>ViXTTS (Mô hình AI Clone giọng nói local GPU)</strong> và tự động chuyển vùng dự phòng sang <strong>Azure Speech API</strong> nếu dịch vụ ViXTTS không khả dụng.
                        </p>

                        <div className="p-3.5 bg-brand-surfaceHover rounded-xl border border-brand-border space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-brand-textSecondary">ViXTTS Service (GPU Local / Modal):</span>
                            <span className="font-bold text-green-400">Ready</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-brand-textSecondary">Chế độ Fallback:</span>
                            <span className="font-bold text-brand-primary">Bật (Auto-switch sang Azure)</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-brand-textSecondary">Azure Speech API Key (Dự phòng)</label>
                          <input
                            type="password"
                            placeholder="Nhập Azure API Key..."
                            value={ttsApiKey}
                            onChange={(e) => setTtsApiKey(e.target.value)}
                            className="input-themed w-full px-3.5 py-2 text-xs"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-brand-textSecondary">Azure Region</label>
                          <input
                            type="text"
                            placeholder="Ví dụ: southeastasia..."
                            value={ttsRegion}
                            onChange={(e) => setTtsRegion(e.target.value)}
                            className="input-themed w-full px-3.5 py-2 text-xs"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveConfig}
                          className="w-full py-2.5 bg-brand-primary hover:brightness-115 text-white font-bold rounded-xl text-xs transition-all shadow-md"
                        >
                          Lưu Cấu Hình Dịch Vụ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODULE 3: BACKDROP PRINTING */}
              {mainTab === 'backdrop' && (
                <div className="max-w-3xl space-y-6">
                  <div className="bg-brand-surface border border-brand-border p-6 rounded-2xl space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-sm sm:text-base text-brand-textPrimary flex items-center gap-2">
                          <Image className="w-5 h-5 text-brand-secondary shrink-0" />
                          Xuất File In Bông Backdrop Khổ Lớn (6m × 3m)
                        </h4>
                        <p className="text-xs text-brand-textSecondary mt-1 leading-relaxed">
                          Tính năng xuất file đồ họa in ấn độ phân giải cao phục vụ thi công backdrop sân khấu Gala và phông chụp ảnh sự kiện IRIS 15.
                        </p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        Admin Only
                      </span>
                    </div>

                    {/* Specifications Card */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-brand-surfaceHover rounded-xl border border-brand-border text-center">
                        <span className="block text-[10px] font-mono text-brand-textMuted uppercase">Khổ in thực</span>
                        <strong className="text-xs font-bold text-brand-textPrimary">6000 × 3000 mm</strong>
                      </div>
                      <div className="p-3 bg-brand-surfaceHover rounded-xl border border-brand-border text-center">
                        <span className="block text-[10px] font-mono text-brand-textMuted uppercase">Độ phân giải</span>
                        <strong className="text-xs font-bold text-brand-secondary">45 DPI (Tối ưu)</strong>
                      </div>
                      <div className="p-3 bg-brand-surfaceHover rounded-xl border border-brand-border text-center">
                        <span className="block text-[10px] font-mono text-brand-textMuted uppercase">Kích thước Canvas</span>
                        <strong className="text-xs font-bold text-brand-textPrimary">~10,630 × 5,315 px</strong>
                      </div>
                      <div className="p-3 bg-brand-surfaceHover rounded-xl border border-brand-border text-center">
                        <span className="block text-[10px] font-mono text-brand-textMuted uppercase">Ảnh đã duyệt</span>
                        <strong className="text-xs font-bold text-emerald-400">{approvedPosts.length} ảnh</strong>
                      </div>
                    </div>

                    {/* Operational Guardrails */}
                    <div className="p-4 bg-brand-card rounded-xl border border-brand-border space-y-2 text-xs text-brand-textSecondary leading-relaxed">
                      <p className="font-semibold text-brand-textPrimary flex items-center gap-1.5">
                        🛡️ Cơ chế an toàn & Tiết kiệm tài nguyên:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-brand-textMuted pl-1">
                        <li><strong>Kiểm tra bản xuất cũ:</strong> Nếu máy chủ đã có sẵn file in được render trước đó, hệ thống sẽ tự động thông báo để bạn chọn dùng lại ngay mà không phải chờ dựng lại.</li>
                        <li><strong>Dựng lại theo yêu cầu:</strong> Bạn có thể chủ động chọn &quot;Dựng lại bản mới&quot; khi có nhiều ảnh kỷ niệm mới vừa được duyệt.</li>
                        <li><strong>Chống sập bộ nhớ:</strong> Quá trình render chạy ngầm đa luồng trong bộ nhớ đệm, có trần bảo vệ 80 MPx.</li>
                      </ul>
                    </div>

                    {/* Action trigger */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={onOpenBackdropViewer}
                        className="btn-gold w-full py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                      >
                        <Image className="w-4 h-4" /> Mở Trình Quản Lý & Xuất File In Bông (Backdrop 2D)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ModalShell>
  );
};
