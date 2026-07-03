import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Check, Trash2, Mic, Image, Settings, Sparkles, AlertCircle, Download } from 'lucide-react';
import { ModalShell } from './ModalShell';

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
  podcasts: Podcast[];
  onApprove: (id: number, approve: boolean) => Promise<void>;
  onGeneratePodcast: (id: number, title: string, apiKey: string, region: string) => Promise<void>;
  onDeletePodcast: (id: number) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  pendingPosts,
  podcasts,
  onApprove,
  onGeneratePodcast,
  onDeletePodcast,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'podcast_list' | 'podcast'>('pending');
  const [ttsApiKey, setTtsApiKey] = useState(() => localStorage.getItem('tts_api_key') || '');
  const [ttsRegion, setTtsRegion] = useState(() => localStorage.getItem('tts_region') || 'eastasia');
  const [podcastTitles, setPodcastTitles] = useState<Record<number, string>>({});
  const [loadingPosts, setLoadingPosts] = useState<Record<number, boolean>>({});
  const [errorMsg, setErrorMsg] = useState('');

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

  const handlePodcastAction = async (id: number, defaultMessage: string) => {
    const title = podcastTitles[id] || `Radio IRIS 15 - Kỷ niệm từ ${defaultMessage.substring(0, 15)}...`;
    setLoadingPosts(prev => ({ ...prev, [id]: true }));
    setErrorMsg('');
    try {
      await onGeneratePodcast(id, title, ttsApiKey, ttsRegion);
      alert('Tạo Podcast AI thành công! Số phát thanh đã được đưa vào danh sách phát.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Thất bại khi kết nối Azure TTS API. Vui lòng kiểm tra lại Api Key.');
    } finally {
      setLoadingPosts(prev => ({ ...prev, [id]: false }));
    }
  };

  const tabs = [
    { id: 'pending' as const, label: `Bài viết chờ phê duyệt (${pendingPosts.length})` },
    { id: 'podcast_list' as const, label: `Quản lý Podcast (${podcasts.length})` },
    { id: 'podcast' as const, label: 'Cấu hình Podcast' },
  ];

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-brand-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-brand-textPrimary flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-primary" /> Ban Tổ Chức - Kiểm Duyệt Sự Kiện
            </h3>
            <p className="text-xs text-brand-textSecondary mt-0.5">Duyệt bài đăng kỷ niệm, xuất ảnh in ấn backdrop và tạo podcast AI.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 bg-brand-surface/60 border-b border-brand-border flex items-center justify-between shrink-0">
          <div className="flex gap-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 px-2 font-bold text-xs border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-brand-secondary text-brand-secondary'
                    : 'border-transparent text-brand-textSecondary hover:text-brand-textPrimary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <a
            href="/api/admin/backdrop"
            target="_blank"
            download
            className="flex items-center gap-1.5 bg-brand-primary hover:brightness-115 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all"
          >
            <Image className="w-3.5 h-3.5" /> Xuất Backdrop 300 DPI
          </a>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="bg-brand-danger/10 border border-brand-danger/25 p-3.5 rounded-xl flex items-start gap-2 text-brand-danger text-xs font-semibold mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'pending' && (
                pendingPosts.length === 0 ? (
                  <div className="text-center py-20 bg-brand-surface/50 rounded-2xl border border-brand-border">
                    <Sparkles className="w-12 h-12 text-brand-textMuted mx-auto mb-3" />
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
                          <th className="p-4 text-center">Tạo Podcast AI</th>
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
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) parent.style.backgroundColor = 'transparent';
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
                                  className="p-1.5 bg-brand-success/10 hover:bg-brand-success hover:text-white border border-brand-success/25 text-brand-success rounded-lg transition-all"
                                  title="Duyệt đăng"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleApproveAction(post.id, false)}
                                  disabled={loadingPosts[post.id]}
                                  className="p-1.5 bg-brand-danger/10 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger rounded-lg transition-all"
                                  title="Reject & Xóa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Tiêu đề Podcast..."
                                  value={podcastTitles[post.id] || ''}
                                  onChange={(e) => setPodcastTitles({ ...podcastTitles, [post.id]: e.target.value })}
                                  className="input-themed w-32 px-2 py-1 text-[10px]"
                                />
                                <button
                                  onClick={() => handlePodcastAction(post.id, post.message)}
                                  disabled={loadingPosts[post.id]}
                                  className="px-2.5 py-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/25 text-brand-primary rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                                >
                                  <Mic className="w-3 h-3" /> Thu âm AI
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

              {activeTab === 'podcast_list' && (
                podcasts.length === 0 ? (
                  <div className="text-center py-20 bg-brand-surface/50 rounded-2xl border border-brand-border">
                    <Mic className="w-12 h-12 text-brand-textMuted mx-auto mb-3" />
                    <p className="text-brand-textSecondary text-sm font-semibold">Chưa có số Podcast phát thanh nào được tạo.</p>
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

              {activeTab === 'podcast' && (
                <div className="max-w-md space-y-6">
                  <div className="bg-brand-surface border border-brand-border p-5 rounded-2xl space-y-4">
                    <h4 className="font-bold text-sm text-brand-textPrimary">Cấu hình Azure Speech API</h4>
                    <p className="text-[11px] text-brand-textSecondary leading-relaxed">
                      Để tạo được giọng nói AI tự động từ lời chúc, hệ thống cần tích hợp Azure Speech Services.
                      Nếu không nhập API Key bên dưới, hệ thống sẽ sử dụng key mặc định được cài đặt trong file{' '}
                      <code className="bg-brand-surfaceHover border border-brand-border px-1 py-0.5 rounded text-brand-danger">appsettings.json</code>{' '}
                      của máy chủ.
                    </p>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-brand-textSecondary">Azure Speech API Key</label>
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
                        placeholder="Ví dụ: eastasia, southeastasia..."
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
                      Lưu cấu hình
                    </button>
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
