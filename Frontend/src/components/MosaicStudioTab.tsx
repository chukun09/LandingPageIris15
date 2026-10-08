import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Crown,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Loader2,
  Heart,
  Building2,
  Layers,
  Zap,
} from 'lucide-react';

interface PostAssignment {
  postId: number;
  rank: number;
  letterId: string;
  letterChar: string;
  tintRole: string; // 'gold' | 'blue'
  areaUnits: number;
  isLargeTile: boolean;
}

interface MosaicPublishState {
  isPublished: boolean;
  publishedAt: string | null;
  layoutId: string | null;
  photoCount: number;
  currentOrder: number[];
  assignments: PostAssignment[];
}

export interface MosaicApprovedPost {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  originalImagePath?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  voteCount: number;
  createdAt: string;
  isPinned?: boolean;
}

interface MosaicStudioTabProps {
  approvedPosts: MosaicApprovedPost[];
  onOpenPreview?: (post: MosaicApprovedPost) => void;
}

export const MosaicStudioTab: React.FC<MosaicStudioTabProps> = ({
  approvedPosts,
  onOpenPreview,
}) => {
  const [state, setState] = useState<MosaicPublishState | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [hoveredPostId, setHoveredPostId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<number | null>(null);

  // Map bài viết theo ID để truy xuất nhanh
  const postMap = useMemo(() => {
    const map = new Map<number, MosaicApprovedPost>();
    approvedPosts.forEach((p) => map.set(p.id, p));
    return map;
  }, [approvedPosts]);

  // Tải trạng thái hiện tại từ backend
  const fetchState = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/mosaic/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MosaicPublishState = await res.json();
      setState(data);
      setOrder(data.currentOrder || []);
    } catch {
      // Fallback nếu chưa có API: lấy theo thứ tự vote của approvedPosts
      const fallbackOrder = [...approvedPosts]
        .sort((a, b) => b.voteCount - a.voteCount || a.id - b.id)
        .map((p) => p.id);
      setOrder(fallbackOrder);
    } finally {
      setIsLoading(false);
    }
  }, [approvedPosts]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Tự động bổ sung các bài viết mới được duyệt mà chưa có trong order
  useEffect(() => {
    if (approvedPosts.length === 0) return;
    setOrder((prev) => {
      const existing = new Set(prev);
      const missing = approvedPosts.filter((p) => !existing.has(p.id)).map((p) => p.id);
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  }, [approvedPosts]);

  // Map thông tin assignment của từng bài viết trong layout
  const assignmentMap = useMemo(() => {
    const map = new Map<number, PostAssignment>();
    if (state?.assignments) {
      state.assignments.forEach((a) => map.set(a.postId, a));
    }
    return map;
  }, [state]);

  // Nhóm các bài viết theo 6 chữ cái: I, R, I, S, 1, 5
  const letterGroups = useMemo(() => {
    const groups: Record<string, { char: string; tint: string; posts: MosaicApprovedPost[] }> = {
      'GI1': { char: 'I', tint: 'gold', posts: [] },
      'GR': { char: 'R', tint: 'gold', posts: [] },
      'GI2': { char: 'I', tint: 'gold', posts: [] },
      'GS': { char: 'S', tint: 'gold', posts: [] },
      'N1': { char: '1', tint: 'blue', posts: [] },
      'N5': { char: '5', tint: 'blue', posts: [] },
    };

    order.forEach((id) => {
      const post = postMap.get(id);
      if (!post) return;
      const assign = assignmentMap.get(id);
      const letterId = assign?.letterId || 'GI1';
      if (groups[letterId]) {
        groups[letterId].posts.push(post);
      } else {
        // Fallback vào chữ cái đầu tiên
        groups['GI1'].posts.push(post);
      }
    });

    return groups;
  }, [order, postMap, assignmentMap]);

  // Thao tác đổi chỗ
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    setOrder((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const moveToTop = (index: number) => {
    if (index === 0) return;
    setOrder((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.unshift(item);
      return copy;
    });
  };

  const handleSwap = (id: number) => {
    if (swapSourceId === null) {
      setSwapSourceId(id);
    } else if (swapSourceId === id) {
      setSwapSourceId(null);
    } else {
      setOrder((prev) => {
        const copy = [...prev];
        const idxA = copy.indexOf(swapSourceId);
        const idxB = copy.indexOf(id);
        if (idxA !== -1 && idxB !== -1) {
          copy[idxA] = id;
          copy[idxB] = swapSourceId;
        }
        return copy;
      });
      setSwapSourceId(null);
    }
  };

  // Presets sắp xếp
  const sortByVotes = () => {
    const sorted = [...order].sort((a, b) => {
      const postA = postMap.get(a);
      const postB = postMap.get(b);
      return (postB?.voteCount || 0) - (postA?.voteCount || 0);
    });
    setOrder(sorted);
    setFeedbackMsg({ type: 'success', text: 'Đã sắp xếp danh sách theo lượt yêu thích giảm dần.' });
  };

  const sortByDepartment = () => {
    // Nhóm theo phòng ban và xen kẽ
    const byDept = new Map<string, number[]>();
    order.forEach((id) => {
      const post = postMap.get(id);
      const dept = post?.department || 'Khác';
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept)!.push(id);
    });

    const result: number[] = [];
    const queues = Array.from(byDept.values());
    let added = true;
    while (added) {
      added = false;
      for (const q of queues) {
        if (q.length > 0) {
          result.push(q.shift()!);
          added = true;
        }
      }
    }
    setOrder(result);
    setFeedbackMsg({ type: 'success', text: 'Đã phân bổ xen kẽ các phòng ban để bức khảm đa dạng màu sắc!' });
  };

  // Xuất bản bố cục lên CDN R2
  const handlePublish = async () => {
    if (order.length === 0) return;
    setIsPublishing(true);
    setPublishStep(1);
    setFeedbackMsg(null);

    const stepTimer = setInterval(() => {
      setPublishStep((s) => (s < 3 ? s + 1 : s));
    }, 1800);

    try {
      const res = await fetch('/api/admin/mosaic/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedPostIds: order }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const updatedState: MosaicPublishState = await res.json();
      setState(updatedState);
      setOrder(updatedState.currentOrder || order);
      setFeedbackMsg({
        type: 'success',
        text: 'Đã xuất bản Bố cục Mosaic và tạo Sprite Atlas HD thành công! Mọi lượt truy cập sẽ tải ngay lập tức từ CDN Cloudflare.',
      });
    } catch (err: unknown) {
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi xuất bản: ${err instanceof Error ? err.message : 'Không xác định'}`,
      });
    } finally {
      clearInterval(stepTimer);
      setIsPublishing(false);
      setPublishStep(0);
    }
  };

  // Khôi phục mặc định
  const handleResetDefault = async () => {
    if (!window.confirm('Bạn có chắc muốn xoá bố cục đã lưu và khôi phục về chế độ tự động tính theo lượt vote?')) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/mosaic/reset-default', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedState: MosaicPublishState = await res.json();
      setState(updatedState);
      setOrder(updatedState.currentOrder || []);
      setFeedbackMsg({ type: 'success', text: 'Đã khôi phục bố cục về chế độ tự động.' });
    } catch (err: unknown) {
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi khôi phục: ${err instanceof Error ? err.message : 'Không xác định'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Live State Banner */}
      <div className="bg-brand-surface border border-brand-border p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-brand-textPrimary flex items-center gap-2">
                  <span>Điều Phối Bố Cục Khảm 3D & Sprite Atlas (IRIS 15)</span>
                  {state?.isPublished ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã Xuất Bản
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <AlertCircle className="w-3.5 h-3.5" /> Chưa Xuất Bản (Bản nháp)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-brand-textSecondary mt-0.5">
                  Sắp xếp vị trí ảnh trên bức khảm chữ IRIS 15. Ảnh ở vị trí đầu sẽ chiếm các ô trung tâm lớn nhất (VIP).
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics & CTA */}
          <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-center">
            {state?.publishedAt && (
              <div className="hidden sm:block text-right pr-2">
                <span className="block text-[10px] text-brand-textMuted">Lần xuất bản gần nhất</span>
                <span className="text-xs font-mono font-medium text-brand-textSecondary">
                  {new Date(state.publishedAt).toLocaleString('vi-VN')}
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={isPublishing || isLoading}
              onClick={handlePublish}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:brightness-110 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang Render Atlas HD...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Lưu & Xuất Bản Khảm HD</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback message banner */}
        <AnimatePresence>
          {feedbackMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-3 border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackMsg(null)}
                className="text-[11px] underline opacity-80 hover:opacity-100"
              >
                Đóng
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. Visual 2D Mini-Map Preview (Khung chữ IRIS 15) */}
      <div className="bg-brand-card border border-brand-border p-4 sm:p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-textSecondary flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-secondary" />
            <span>Bản Đồ Phân Bổ Chữ Cái: I – R – I – S – 1 – 5</span>
          </h4>
          <span className="text-[11px] text-brand-textMuted font-mono">
            {order.length} ảnh đã duyệt
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          {Object.entries(letterGroups).map(([key, group]) => {
            const isBlue = group.tint === 'blue';
            return (
              <div
                key={key}
                className={`p-3 rounded-xl border transition-all ${
                  isBlue
                    ? 'bg-blue-950/20 border-blue-500/30'
                    : 'bg-amber-950/20 border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-lg font-black ${
                      isBlue ? 'text-blue-400' : 'text-amber-400'
                    }`}
                  >
                    {group.char}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-surface border border-brand-border text-brand-textMuted">
                    {group.posts.length} ô
                  </span>
                </div>

                {/* Danh sách ảnh thu nhỏ trong chữ này */}
                <div className="flex flex-wrap gap-1 min-h-[36px]">
                  {group.posts.slice(0, 4).map((p, pIdx) => {
                    const isHovered = hoveredPostId === p.id;
                    const isVip = pIdx === 0;
                    return (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHoveredPostId(p.id)}
                        onMouseLeave={() => setHoveredPostId(null)}
                        className={`relative w-7 h-7 rounded-md overflow-hidden border cursor-pointer transition-transform ${
                          isHovered
                            ? 'scale-125 z-10 border-white shadow-md'
                            : isVip
                            ? 'border-amber-400 ring-1 ring-amber-400/50'
                            : 'border-brand-border/60'
                        }`}
                        title={`#${p.id} - ${p.department} (${p.voteCount} votes)`}
                      >
                        <img
                          src={p.thumbnailUrl || p.thumbnailImagePath || '/placeholder.png'}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isVip && (
                          <div className="absolute top-0 right-0 p-0.5 bg-amber-500 text-slate-950 rounded-bl text-[8px] leading-none">
                            ★
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {group.posts.length > 4 && (
                    <div className="w-7 h-7 rounded-md bg-brand-surfaceHover border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand-textMuted">
                      +{group.posts.length - 4}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Sorting Presets & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface/60 border border-brand-border p-3 rounded-xl">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-brand-textMuted mr-1">Bộ lọc & Sắp xếp:</span>
          <button
            type="button"
            onClick={sortByVotes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-card hover:bg-brand-surfaceHover border border-brand-border text-brand-textPrimary transition-colors shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Xếp theo Vote (Đề xuất)</span>
          </button>
          <button
            type="button"
            onClick={sortByDepartment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-card hover:bg-brand-surfaceHover border border-brand-border text-brand-textPrimary transition-colors shadow-sm"
          >
            <Building2 className="w-3.5 h-3.5 text-brand-secondary" />
            <span>Phân bổ Phòng ban</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surface transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục ban đầu</span>
          </button>
        </div>

        {swapSourceId !== null && (
          <div className="flex items-center gap-2 text-xs bg-amber-500/15 text-amber-300 px-3 py-1 rounded-lg border border-amber-500/30">
            <span>Đang chọn bài #{swapSourceId}. Chọn bài thứ 2 để đổi vị trí!</span>
            <button
              type="button"
              onClick={() => setSwapSourceId(null)}
              className="font-bold underline ml-1"
            >
              Hủy
            </button>
          </div>
        )}
      </div>

      {/* 4. Interactive Ordered List */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {order.map((postId, index) => {
            const post = postMap.get(postId);
            if (!post) return null;

            const assign = assignmentMap.get(postId);
            const isVip = index === 0;
            const isHighRank = index < 3;
            const isHovered = hoveredPostId === postId;
            const isSwapSource = swapSourceId === postId;

            return (
              <motion.div
                key={postId}
                layout
                transition={{ duration: 0.18 }}
                onMouseEnter={() => setHoveredPostId(postId)}
                onMouseLeave={() => setHoveredPostId(null)}
                className={`relative rounded-xl border p-3 flex gap-3 transition-all ${
                  isSwapSource
                    ? 'ring-2 ring-amber-400 bg-amber-500/10 border-amber-400'
                    : isHovered
                    ? 'border-brand-primary/80 bg-brand-surfaceHover shadow-md'
                    : isVip
                    ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                    : 'bg-brand-card border-brand-border'
                }`}
              >
                {/* Thumbnail with Rank Badge */}
                <div className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-brand-border/60 bg-black/40 group">
                  <img
                    src={post.thumbnailUrl || post.thumbnailImagePath || '/placeholder.png'}
                    alt=""
                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                    loading="lazy"
                  />
                  {onOpenPreview && (
                    <button
                      type="button"
                      onClick={() => onOpenPreview(post)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                      title="Xem ảnh lớn"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}

                  {/* Rank tag */}
                  <div
                    className={`absolute top-0 left-0 px-1.5 py-0.5 text-[10px] font-black rounded-br shadow-sm ${
                      isVip
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950'
                        : isHighRank
                        ? 'bg-amber-500/80 text-white'
                        : 'bg-black/70 text-slate-200'
                    }`}
                  >
                    {isVip ? (
                      <span className="flex items-center gap-0.5">
                        <Crown className="w-2.5 h-2.5" /> #1 VIP
                      </span>
                    ) : (
                      `#${index + 1}`
                    )}
                  </div>
                </div>

                {/* Info & Badges */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-brand-secondary truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{post.department}</span>
                      </span>
                      <span className="text-[10px] text-rose-400 font-bold shrink-0 flex items-center gap-0.5">
                        <Heart className="w-3 h-3 fill-rose-500/20" />
                        {post.voteCount}
                      </span>
                    </div>

                    <p className="text-xs text-brand-textPrimary line-clamp-2 leading-relaxed">
                      {post.message}
                    </p>

                    {/* Vị trí dự kiến trên chữ */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-bold ${
                          assign?.tintRole === 'blue'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        Chữ {assign?.letterChar || 'I'} • {assign?.isLargeTile ? 'Ô Đại' : 'Ô Chuẩn'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-1 pt-2 border-t border-brand-border/40 mt-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveToTop(index)}
                      className="p-1 rounded text-[10px] font-bold text-amber-400 hover:bg-amber-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Đưa lên Top 1 VIP"
                    >
                      <Crown className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveItem(index, 'up')}
                        className="p-1 rounded text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface disabled:opacity-20"
                        title="Đẩy lên 1 bậc"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={index === order.length - 1}
                        onClick={() => moveItem(index, 'down')}
                        className="p-1 rounded text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface disabled:opacity-20"
                        title="Đẩy xuống 1 bậc"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSwap(postId)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          isSwapSource
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-brand-surface hover:bg-brand-surfaceHover border-brand-border text-brand-textSecondary'
                        }`}
                        title="Đổi vị trí với ô khác"
                      >
                        {isSwapSource ? 'Đang chọn' : 'Đổi vị trí'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 5. Publishing Process Overlay */}
      <AnimatePresence>
        {isPublishing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="bg-brand-card border border-brand-border p-6 rounded-2xl max-w-md w-full text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>

              <div>
                <h4 className="font-bold text-base text-brand-textPrimary">
                  Đang Xuất Bản Khảm Mosaic HD
                </h4>
                <p className="text-xs text-brand-textSecondary mt-1">
                  Đang nạp ảnh Preview 1600px sắc nét và tổng hợp Sprite Atlas chuẩn cho Cloudflare CDN.
                </p>
              </div>

              {/* Progress Steps */}
              <div className="space-y-2 text-left pt-2">
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition-colors ${
                    publishStep >= 1
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-brand-surface border-brand-border text-brand-textMuted'
                  }`}
                >
                  {publishStep >= 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <div className="w-4 h-4 rounded-full border border-current" />}
                  <span>1. Nạp ảnh Preview 1600px sắc nét...</span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition-colors ${
                    publishStep >= 2
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-brand-surface border-brand-border text-brand-textMuted'
                  }`}
                >
                  {publishStep >= 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <div className="w-4 h-4 rounded-full border border-current" />}
                  <span>2. Ghép & nén Sprite Atlas WebP (128px & 64px)...</span>
                </div>

                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition-colors ${
                    publishStep >= 3
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-brand-surface border-brand-border text-brand-textMuted'
                  }`}
                >
                  {publishStep >= 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <div className="w-4 h-4 rounded-full border border-current" />}
                  <span>3. Lưu trữ vĩnh viễn lên Cloudflare R2 & CDN...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
