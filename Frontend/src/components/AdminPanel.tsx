import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Check, Trash2, Image, Settings, Sparkles, Download, Radio } from 'lucide-react';
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
  onGeneratePodcast: (id: number, title: string, apiKey: string, region: string) => Promise<void>;
  onUploadPodcast: (formData: FormData) => Promise<void>;
  onDeletePodcast: (id: number) => Promise<void>;
  onOpenBackdropViewer?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  pendingPosts,
  approvedPosts,
  podcasts,
  onApprove,
  onGeneratePodcast,
  onUploadPodcast,
  onDeletePodcast,
  onOpenBackdropViewer,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'podcast_studio' | 'podcast_list' | 'podcast_config' | 'backdrop'>('pending');
  const [ttsApiKey, setTtsApiKey] = useState(() => localStorage.getItem('tts_api_key') || '');
  const [ttsRegion, setTtsRegion] = useState(() => localStorage.getItem('tts_region') || 'eastasia');
  const [loadingPosts, setLoadingPosts] = useState<Record<number, boolean>>({});

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
    setLoadingPosts(prev => ({ ...prev, [id]: true }));
    try {
      await onDeletePodcast(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Xóa podcast thất bại.');
    } finally {
      setLoadingPosts(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveConfig = () => {
    localStorage.setItem('tts_api_key', ttsApiKey);
    localStorage.setItem('tts_region', ttsRegion);
    alert('Đã lưu cấu hình dịch vụ Azure Speech thành công!');
  };

  const handleApproveAction = async (id: number, approve: boolean) => {
    setLoadingPosts(prev => ({ ...prev, [id]: true }));
    try {
      await onApprove(id, approve);
    } catch {
      alert('Thao tác phê duyệt thất bại.');
    } finally {
      setLoadingPosts(prev => ({ ...prev, [id]: false }));
    }
  };

  const tabs = [
    { id: 'pending' as const, label: `Bài chờ duyệt (${pendingPosts.length})` },
    { id: 'podcast_studio' as const, label: 'Podcast AI Studio 🎙️' },
    { id: 'podcast_list' as const, label: `Danh sách Radio (${podcasts.length})` },
    { id: 'podcast_config' as const, label: 'Cấu hình TTS' },
    { id: 'backdrop' as const, label: 'Bản Bông In Ấn (Backdrop) 🖨️' },
  ];

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-5xl">
      <div className="flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-brand-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-brand-textPrimary flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-primary" /> Ban Tổ Chức - Quản Trị Sự Kiện
            </h3>
            <p className="text-xs text-brand-textSecondary mt-0.5">Duyệt kỷ niệm, tạo số Radio Podcast AI và quản lý Backdrop in ấn.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 bg-brand-surface/60 border-b border-brand-border flex items-center justify-between shrink-0 overflow-x-auto">
          <div className="flex gap-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 px-2 font-bold text-xs border-b-2 whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'border-brand-secondary text-brand-secondary'
                    : 'border-transparent text-brand-textSecondary hover:text-brand-textPrimary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={onOpenBackdropViewer}
            className="flex items-center gap-1.5 bg-brand-primary hover:brightness-115 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-sm shrink-0 ml-2"
          >
            <Image className="w-3.5 h-3.5" /> Xem Backdrop 2D Fullscreen
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Tab 1: Pending Posts */}
              {activeTab === 'pending' && (
                pendingPosts.length === 0 ? (
                  <div className="text-center py-20 bg-brand-surface/50 rounded-2xl border border-brand-border space-y-3">
                    <Sparkles className="w-12 h-12 text-brand-textMuted mx-auto" />
                    <p className="text-brand-textSecondary text-sm font-semibold">Tất cả bài viết đã được phê duyệt xong!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-brand-border rounded-2xl bg-brand-card">
                    <table className="w-full border-collapse text-left text-xs text-brand-textSecondary">
                      <thead>
                        <tr className="bg-brand-surface border-b border-brand-border font-bold text-brand-textPrimary">
                          <th className="p-4">Hình ảnh</th>
                          <th className="p-4">Lời chúc / Kỷ niệm</th>
                          <th className="p-4">Phòng ban</th>
                          <th className="p-4 text-center">Thao tác duyệt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingPosts.map((post) => (
                          <tr key={post.id} className="border-b border-brand-border/60 hover:bg-brand-surface/50 transition-colors">
                            <td className="p-4">
                              <img
                                src={post.thumbnailUrl || post.thumbnailImagePath}
                                alt="thumb"
                                className="w-12 h-12 object-cover rounded-lg border border-brand-border"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </td>
                            <td className="p-4 max-w-sm whitespace-pre-line leading-relaxed font-normal text-brand-textPrimary">
                              {post.message}
                            </td>
                            <td className="p-4 font-bold text-brand-textPrimary">{post.department || 'Ẩn danh'}</td>
                            <td className="p-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleApproveAction(post.id, true)}
                                  disabled={loadingPosts[post.id]}
                                  className="p-2 bg-brand-success/10 hover:bg-brand-success hover:text-white border border-brand-success/25 text-brand-success rounded-lg transition-all flex items-center gap-1 font-bold"
                                  title="Duyệt đăng bài"
                                >
                                  <Check className="w-4 h-4" /> Duyệt
                                </button>
                                <button
                                  onClick={() => handleApproveAction(post.id, false)}
                                  disabled={loadingPosts[post.id]}
                                  className="p-2 bg-brand-danger/10 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger rounded-lg transition-all flex items-center gap-1 font-bold"
                                  title="Từ chối & Xóa bài"
                                >
                                  <Trash2 className="w-4 h-4" /> Xóa
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

              {/* Tab 2: Podcast Studio (Dedicated AI Generator & Manual Upload) */}
              {activeTab === 'podcast_studio' && (
                <PodcastStudioTab
                  pendingPosts={pendingPosts}
                  approvedPosts={approvedPosts}
                  onGeneratePodcast={onGeneratePodcast}
                  onUploadPodcast={onUploadPodcast}
                />
              )}

              {/* Tab 3: Podcast List */}
              {activeTab === 'podcast_list' && (
                podcasts.length === 0 ? (
                  <div className="text-center py-20 bg-brand-surface/50 rounded-2xl border border-brand-border space-y-3">
                    <Radio className="w-12 h-12 text-brand-textMuted mx-auto" />
                    <p className="text-brand-textSecondary text-sm font-semibold">Chưa có số Radio phát thanh nào được tạo.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-brand-border rounded-2xl bg-brand-card">
                    <table className="w-full border-collapse text-left text-xs text-brand-textSecondary">
                      <thead>
                        <tr className="bg-brand-surface border-b border-brand-border font-bold text-brand-textPrimary">
                          <th className="p-4 w-12">ID</th>
                          <th className="p-4">Tiêu đề số phát thanh</th>
                          <th className="p-4">Thời lượng</th>
                          <th className="p-4">Ngày tạo</th>
                          <th className="p-4 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {podcasts.map((pod) => (
                          <tr key={pod.id} className="border-b border-brand-border/60 hover:bg-brand-surface/50 transition-colors">
                            <td className="p-4 font-bold text-brand-textPrimary">{pod.id}</td>
                            <td className="p-4 font-semibold text-brand-textPrimary max-w-sm truncate">{pod.title}</td>
                            <td className="p-4">{Math.floor(pod.durationSeconds / 60)}m {pod.durationSeconds % 60}s</td>
                            <td className="p-4">
                              {new Date(pod.createdAt).toLocaleDateString('vi-VN', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                            <td className="p-4">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleDownload(pod.audioUrl, pod.title)}
                                  className="p-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/25 text-brand-primary rounded-lg transition-all"
                                  title="Tải xuống tệp MP3"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAction(pod.id)}
                                  disabled={loadingPosts[pod.id]}
                                  className="p-1.5 bg-brand-danger/10 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger rounded-lg transition-all"
                                  title="Xóa Podcast"
                                >
                                  <Trash2 className="w-4 h-4" />
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

              {/* Tab 4: Podcast TTS Config */}
              {activeTab === 'podcast_config' && (
                <div className="max-w-md space-y-6">
                  <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-brand-textPrimary">Cấu hình Động cơ AI TTS (ViXTTS / Azure)</h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                        ViXTTS Auto-Fallback
                      </span>
                    </div>
                    <p className="text-[11px] text-brand-textSecondary leading-relaxed">
                      Hệ thống hỗ trợ tạo giọng đọc tự động bằng <strong>ViXTTS (Mô hình AI Clone giọng nói local GPU)</strong> và tự động chuyển vùng dự phòng sang <strong>Azure Speech API</strong> nếu dịch vụ ViXTTS không khả dụng.
                    </p>

                    <div className="p-3 bg-brand-surfaceHover rounded-xl border border-brand-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-brand-textSecondary">ViXTTS Service (GPU Local):</span>
                        <span className="font-bold text-green-400">Ready (http://localhost:8000)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-brand-textSecondary">Chế độ Fallback:</span>
                        <span className="font-bold text-brand-primary">Bật (Auto-switch sang Azure)</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-brand-textSecondary">Azure Speech API Key (Dự phòng)</label>
                      <input
                        type="password"
                        placeholder="Nhập Azure API Key..."
                        value={ttsApiKey}
                        onChange={(e) => setTtsApiKey(e.target.value)}
                        className="input-themed w-full px-3 py-2 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-brand-textSecondary">Azure Region</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: southeastasia..."
                        value={ttsRegion}
                        onChange={(e) => setTtsRegion(e.target.value)}
                        className="input-themed w-full px-3 py-2 text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      className="w-full py-2 bg-brand-primary hover:brightness-115 text-white font-bold rounded-xl text-xs transition-all shadow-md"
                    >
                      Lưu Cấu Hình Dịch Vụ
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 5: Backdrop Printing Control */}
              {activeTab === 'backdrop' && (
                <div className="max-w-2xl space-y-6">
                  <div className="bg-brand-surface border border-brand-border p-6 rounded-2xl space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-sm text-brand-textPrimary flex items-center gap-2">
                          <Image className="w-5 h-5 text-brand-secondary" />
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
                        <Image className="w-4 h-4" /> Mở Trình Quản Lý & Xuất File In Bông
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
