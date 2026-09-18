import React, { useState } from 'react';
import { Mic, Sparkles, Search, CheckCircle2, Clock, Volume2, AlertCircle } from 'lucide-react';

interface MemoryPostItem {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  createdAt: string;
  isApproved?: boolean;
}

interface PodcastStudioTabProps {
  pendingPosts: MemoryPostItem[];
  approvedPosts: MemoryPostItem[];
  onGeneratePodcast: (id: number, title: string, apiKey: string, region: string) => Promise<void>;
}

export const PodcastStudioTab: React.FC<PodcastStudioTabProps> = ({
  pendingPosts,
  approvedPosts,
  onGeneratePodcast,
}) => {
  const [listType, setListType] = useState<'pending' | 'approved'>('approved');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPost, setSelectedPost] = useState<MemoryPostItem | null>(null);
  const [podcastTitle, setPodcastTitle] = useState('');
  const [ttsApiKey, setTtsApiKey] = useState(() => localStorage.getItem('tts_api_key') || '');
  const [ttsRegion, setTtsRegion] = useState(() => localStorage.getItem('tts_region') || 'eastasia');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeList = listType === 'pending' ? pendingPosts : approvedPosts;
  const filteredPosts = activeList.filter(p =>
    (p.message && p.message.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.department && p.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelectPost = (post: MemoryPostItem) => {
    setSelectedPost(post);
    // Auto-generate title
    const shortDept = post.department ? `[${post.department}]` : '';
    const dateStr = new Date(post.createdAt).toLocaleDateString('vi-VN');
    setPodcastTitle(`Radio IRIS 15 ${shortDept} - Kỷ niệm ${dateStr}`);
    setStatusMessage(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost) return;
    if (!podcastTitle.trim()) {
      setStatusMessage({ type: 'error', text: 'Vui lòng nhập tiêu đề số phát thanh Podcast.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await onGeneratePodcast(selectedPost.id, podcastTitle, ttsApiKey, ttsRegion);
      setStatusMessage({
        type: 'success',
        text: `Đã khởi tạo thành công Podcast Radio AI: "${podcastTitle}"!`,
      });
      setSelectedPost(null);
      setPodcastTitle('');
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Tạo Podcast AI thất bại. Vui lòng kiểm tra lại dịch vụ TTS.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveConfig = () => {
    localStorage.setItem('tts_api_key', ttsApiKey);
    localStorage.setItem('tts_region', ttsRegion);
    alert('Đã lưu cấu hình khóa API Azure Speech thành công!');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Studio Header */}
      <div className="bg-brand-surface/60 border border-brand-border/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-2xl">
            <Mic className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-brand-textPrimary flex items-center gap-2">
              Podcast AI Studio — Chuyển Kỷ Niệm Thành Thanh Âm Radio
            </h3>
            <p className="text-xs text-brand-textSecondary">
              Chọn bất kỳ bài viết nào (đã duyệt hoặc chưa duyệt) để chuyển đổi nội dung lời chúc thành số phát thanh AI.
            </p>
          </div>
        </div>

        {/* List type toggle */}
        <div className="flex items-center bg-brand-bg p-1 rounded-xl border border-brand-border shrink-0 self-start md:self-auto">
          <button
            onClick={() => { setListType('approved'); setSelectedPost(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              listType === 'approved'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-brand-textMuted hover:text-brand-textPrimary'
            }`}
          >
            Đã Duyệt ({approvedPosts.length})
          </button>
          <button
            onClick={() => { setListType('pending'); setSelectedPost(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              listType === 'pending'
                ? 'bg-brand-secondary text-brand-bg shadow-sm'
                : 'text-brand-textMuted hover:text-brand-textPrimary'
            }`}
          >
            Chờ Duyệt ({pendingPosts.length})
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left List (Pick Post), Right Form (Config & Generate) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Post Selection List (5 Cols) */}
        <div className="lg:col-span-5 space-y-3 flex flex-col">
          <div className="relative">
            <Search className="w-4 h-4 text-brand-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo nội dung, phòng ban..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-textPrimary focus:outline-none focus:border-brand-primary transition-all"
            />
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1 flex-1">
            {filteredPosts.length === 0 ? (
              <div className="p-8 text-center bg-brand-surface/30 border border-dashed border-brand-border rounded-2xl">
                <p className="text-xs text-brand-textMuted italic">
                  Không tìm thấy bài viết nào trong danh sách {listType === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}.
                </p>
              </div>
            ) : (
              filteredPosts.map((post) => {
                const isSelected = selectedPost?.id === post.id;
                const imgUrl = post.thumbnailUrl || post.thumbnailImagePath;
                return (
                  <div
                    key={post.id}
                    onClick={() => handleSelectPost(post)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary text-brand-textPrimary shadow-sm'
                        : 'bg-brand-surface/40 border-brand-border/60 hover:bg-brand-surfaceHover hover:border-brand-border text-brand-textSecondary'
                    }`}
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt="Post thumb"
                        className="w-12 h-12 rounded-xl object-cover border border-brand-border/60 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border shrink-0 flex items-center justify-center text-brand-textMuted text-xs font-bold">
                        IRIS
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-surface border border-brand-border text-brand-primary truncate">
                          {post.department || 'Ẩn danh'}
                        </span>
                        {listType === 'pending' ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Chờ duyệt
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Đã duyệt
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-normal line-clamp-2 leading-relaxed text-brand-textPrimary">
                        "{post.message}"
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Radio Generation Panel (7 Cols) */}
        <div className="lg:col-span-7 bg-brand-surface/30 border border-brand-border/60 rounded-2xl p-5 space-y-4">
          {!selectedPost ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="p-4 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                <Volume2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-brand-textPrimary">Chưa chọn bài viết</h4>
              <p className="text-xs text-brand-textMuted max-w-sm">
                Vui lòng nhấp vào một bài viết từ danh sách bên trái để mở bảng khởi tạo Podcast AI.
              </p>
            </div>
          ) : (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
                <h4 className="text-sm font-black text-brand-textPrimary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-secondary" /> Khởi Tạo Số Phát Thanh AI
                </h4>
                <span className="text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-md border border-brand-primary/20">
                  Bài viết ID #{selectedPost.id}
                </span>
              </div>

              {/* Selected Post Preview */}
              <div className="p-3.5 rounded-xl bg-brand-surface/60 border border-brand-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider">
                    Nội dung kịch bản lời chúc:
                  </span>
                  <span className="text-[10px] text-brand-textMuted font-fira">
                    {selectedPost.department || 'Ẩn danh'}
                  </span>
                </div>
                <p className="text-xs italic text-brand-textPrimary leading-relaxed">
                  "{selectedPost.message}"
                </p>
              </div>

              {/* Podcast Title Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-brand-textSecondary">
                  Tiêu đề Số phát sóng Radio:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tiêu đề radio..."
                  value={podcastTitle}
                  onChange={(e) => setPodcastTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-textPrimary font-semibold focus:outline-none focus:border-brand-primary transition-all"
                />
              </div>

              {/* Config Accordion for Azure TTS (Optional) */}
              <div className="p-3.5 rounded-xl bg-brand-bg/60 border border-brand-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-brand-textSecondary">
                    Cấu hình Azure Speech API (Tùy chọn)
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="text-[10px] font-bold text-brand-primary hover:underline"
                  >
                    Lưu cấu hình
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="password"
                    placeholder="Azure Speech API Key"
                    value={ttsApiKey}
                    onChange={(e) => setTtsApiKey(e.target.value)}
                    className="px-3 py-2 bg-brand-surface border border-brand-border rounded-lg text-xs text-brand-textPrimary focus:outline-none focus:border-brand-primary"
                  />
                  <input
                    type="text"
                    placeholder="Region (ví dụ: eastasia)"
                    value={ttsRegion}
                    onChange={(e) => setTtsRegion(e.target.value)}
                    className="px-3 py-2 bg-brand-surface border border-brand-border rounded-lg text-xs text-brand-textPrimary focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <p className="text-[10px] text-brand-textMuted">
                  *Nếu để trống API Key, hệ thống sẽ sử dụng dịch vụ ViXTTS Tiếng Việt mặc định của dự án.
                </p>
              </div>

              {/* Notification Banner */}
              {statusMessage && (
                <div
                  className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  className="px-4 py-2 rounded-xl border border-brand-border text-xs font-bold text-brand-textSecondary hover:bg-brand-surfaceHover transition-all"
                >
                  Hủy chọn
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-gold flex items-center gap-2 text-xs px-5 py-2.5 rounded-xl shadow-glow-gold-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-brand-bg border-t-transparent rounded-full animate-spin" />
                      <span>Đang tổng hợp AI Voice...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Khởi Tạo Podcast AI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
