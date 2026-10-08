import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Loader2,
  Heart,
  Building2,
  Layers,
  Zap,
  Search,
  ZoomIn,
  ZoomOut,
  ArrowLeftRight,
  HelpCircle,
} from 'lucide-react';
import type { MosaicLayoutResponse, MosaicTile } from '../types/mosaic';

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
  adminToken?: string;
  onAuthExpired?: () => void;
  onOpenPreview?: (post: MosaicApprovedPost) => void;
}

export const MosaicStudioTab: React.FC<MosaicStudioTabProps> = ({
  approvedPosts,
  adminToken,
  onAuthExpired,
  onOpenPreview,
}) => {
  const [state, setState] = useState<MosaicPublishState | null>(null);
  const [layout, setLayout] = useState<MosaicLayoutResponse | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Interactive Model State
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [selectedDrawerPostId, setSelectedDrawerPostId] = useState<number | null>(null);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [dragOverRank, setDragOverRank] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 100 | 140 | 180
  const [selectedLetterFilter, setSelectedLetterFilter] = useState<string>('ALL');
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerLetterFilter, setDrawerLetterFilter] = useState<string>('ALL');

  const boardScrollRef = useRef<HTMLDivElement>(null);

  // Lấy Admin Headers kèm Bearer token
  const getAdminHeaders = useCallback(
    (extra: Record<string, string> = {}) => {
      const token = adminToken || (typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') : null) || '';
      return {
        ...extra,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
    [adminToken]
  );

  // Map bài viết theo ID để truy xuất nhanh O(1)
  const postMap = useMemo(() => {
    const map = new Map<number, MosaicApprovedPost>();
    approvedPosts.forEach((p) => map.set(p.id, p));
    return map;
  }, [approvedPosts]);

  // Tải trạng thái và bố cục hình học từ backend
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [layoutRes, stateRes] = await Promise.all([
        fetch(`/api/mosaic/layout?_t=${Date.now()}`),
        fetch(`/api/admin/mosaic/state?_t=${Date.now()}`, {
          headers: getAdminHeaders(),
        }),
      ]);

      if (stateRes.status === 401) {
        onAuthExpired?.();
        setFeedbackMsg({
          type: 'error',
          text: 'Phiên đăng nhập ban tổ chức không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
        });
        return;
      }

      if (layoutRes.ok) {
        const layoutData: MosaicLayoutResponse = await layoutRes.json();
        setLayout(layoutData);
      }

      if (stateRes.ok) {
        const stateData: MosaicPublishState = await stateRes.json();
        setState(stateData);
        if (stateData.currentOrder && stateData.currentOrder.length > 0) {
          setOrder(stateData.currentOrder);
        } else {
          const fallbackOrder = [...approvedPosts]
            .sort((a, b) => b.voteCount - a.voteCount || a.id - b.id)
            .map((p) => p.id);
          setOrder(fallbackOrder);
        }
      } else {
        const fallbackOrder = [...approvedPosts]
          .sort((a, b) => b.voteCount - a.voteCount || a.id - b.id)
          .map((p) => p.id);
        setOrder(fallbackOrder);
      }
    } catch {
      const fallbackOrder = [...approvedPosts]
        .sort((a, b) => b.voteCount - a.voteCount || a.id - b.id)
        .map((p) => p.id);
      setOrder(fallbackOrder);
    } finally {
      setIsLoading(false);
    }
  }, [approvedPosts, getAdminHeaders, onAuthExpired]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Map vị trí chữ cái của từng tile
  const rankToTileMap = useMemo(() => {
    const map = new Map<number, MosaicTile>();
    if (layout?.tiles) {
      layout.tiles.forEach((t) => map.set(t.rank, t));
    }
    return map;
  }, [layout]);

  // Map postId sang thông tin vị trí hiện tại trên bức khảm
  const postPlacementMap = useMemo(() => {
    const map = new Map<number, { rank: number; tile?: MosaicTile; letterChar: string; isGold: boolean }>();
    order.forEach((postId, rank) => {
      const tile = rankToTileMap.get(rank);
      const letterChar = tile
        ? tile.letterId === 'GI1' || tile.letterId === 'GI2'
          ? 'I'
          : tile.letterId === 'GR'
          ? 'R'
          : tile.letterId === 'GS'
          ? 'S'
          : tile.letterId === 'N1'
          ? '1'
          : tile.letterId === 'N5'
          ? '5'
          : 'I'
        : 'I';
      const isGold = !tile || tile.letterId.startsWith('G');
      map.set(postId, { rank, tile, letterChar, isGold });
    });
    return map;
  }, [order, rankToTileMap]);

  // Hoán đổi vị trí giữa 2 rank
  const swapRanks = useCallback((rankA: number, rankB: number) => {
    if (rankA === rankB) return;
    setOrder((prev) => {
      const next = [...prev];
      const temp = next[rankA];
      next[rankA] = next[rankB];
      next[rankB] = temp;
      return next;
    });
    setSelectedRank(null);
    setSelectedDrawerPostId(null);
    setFeedbackMsg({
      type: 'success',
      text: `Đã đổi chỗ thành công giữa Ô #${rankA + 1} và Ô #${rankB + 1}!`,
    });
  }, []);

  // Gán bài viết cụ thể vào một rank mục tiêu
  const placePostIntoRank = useCallback(
    (postId: number, targetRank: number) => {
      setOrder((prev) => {
        const currentRank = prev.indexOf(postId);
        const next = [...prev];
        if (currentRank !== -1) {
          const temp = next[targetRank];
          next[targetRank] = next[currentRank];
          next[currentRank] = temp;
        } else {
          next[targetRank] = postId;
        }
        return next;
      });
      setSelectedRank(null);
      setSelectedDrawerPostId(null);
      setFeedbackMsg({
        type: 'success',
        text: `Đã gán bài viết #${postId} vào Ô #${targetRank + 1} thành công!`,
      });
    },
    []
  );

  // Xử lý click vào một ô trên mô hình IRIS 15
  const handleTileClick = (tileRank: number) => {
    // 1. Đang có ảnh được chọn trong Khay ảnh -> Gán ngay ảnh đó vào ô này
    if (selectedDrawerPostId !== null) {
      placePostIntoRank(selectedDrawerPostId, tileRank);
      return;
    }

    // 2. Đang có một ô khác được chọn trên mô hình -> Hoán đổi vị trí 2 ô
    if (selectedRank !== null) {
      if (selectedRank === tileRank) {
        setSelectedRank(null);
      } else {
        swapRanks(selectedRank, tileRank);
      }
      return;
    }

    // 3. Chưa chọn gì -> Chọn ô này
    setSelectedRank(tileRank);
  };

  // Xử lý click vào card ảnh trong khay
  const handleDrawerCardClick = (postId: number) => {
    // Nếu đang có một ô được chọn trên mô hình -> Gán ảnh vào ô đó ngay
    if (selectedRank !== null) {
      placePostIntoRank(postId, selectedRank);
      return;
    }

    // Chưa có ô nào chọn -> Chọn hoặc bỏ chọn card này
    if (selectedDrawerPostId === postId) {
      setSelectedDrawerPostId(null);
    } else {
      setSelectedDrawerPostId(postId);
    }
  };

  // Drag & Drop handlers
  const handleTileDragStart = (e: React.DragEvent, rank: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'tile', rank }));
  };

  const handleDrawerDragStart = (e: React.DragEvent, postId: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'post', postId }));
  };

  const handleTileDrop = (e: React.DragEvent, targetRank: number) => {
    e.preventDefault();
    setDragOverRank(null);
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'tile') {
        swapRanks(data.rank, targetRank);
      } else if (data.type === 'post') {
        placePostIntoRank(data.postId, targetRank);
      }
    } catch {
      // fallback
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
    setSelectedRank(null);
    setSelectedDrawerPostId(null);
    setFeedbackMsg({ type: 'success', text: 'Đã sắp xếp danh sách theo lượt yêu thích giảm dần.' });
  };

  const sortByDepartment = () => {
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
    setSelectedRank(null);
    setSelectedDrawerPostId(null);
    setFeedbackMsg({ type: 'success', text: 'Đã phân bổ xen kẽ các phòng ban để bức khảm đa dạng màu sắc!' });
  };

  // Khôi phục mặc định
  const handleResetDefault = async () => {
    if (!window.confirm('Bạn có chắc muốn xoá bố cục đã lưu và khôi phục về chế độ tự động tính theo lượt vote?')) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/mosaic/reset-default', {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        throw new Error('Phiên đăng nhập ban tổ chức đã hết hạn.');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedState: MosaicPublishState = await res.json();
      setState(updatedState);
      setOrder(updatedState.currentOrder || []);
      setSelectedRank(null);
      setSelectedDrawerPostId(null);
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
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderedPostIds: order }),
      });

      if (res.status === 401) {
        onAuthExpired?.();
        throw new Error('Phiên đăng nhập ban tổ chức không hợp lệ hoặc đã hết hạn.');
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const updatedState: MosaicPublishState = await res.json();
      setState(updatedState);
      setOrder(updatedState.currentOrder || order);
      setSelectedRank(null);
      setSelectedDrawerPostId(null);
      setFeedbackMsg({
        type: 'success',
        text: 'Đã xuất bản Bố cục Mosaic và dựng Sprite Atlas HD thành công! Mọi lượt truy cập sẽ tải ngay lập tức từ CDN Cloudflare.',
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

  // Thông số lưới hình học
  const cols = layout?.lattice?.cols || 160;
  const rows = layout?.lattice?.rows || 32;
  const letters = layout?.letters || [
    { id: 'GI1', char: 'I', tintRole: 'gold', printHex: '#FFE082', order: 0 },
    { id: 'GR', char: 'R', tintRole: 'gold', printHex: '#FFE082', order: 1 },
    { id: 'GI2', char: 'I', tintRole: 'gold', printHex: '#FFE082', order: 2 },
    { id: 'GS', char: 'S', tintRole: 'gold', printHex: '#FFE082', order: 3 },
    { id: 'N1', char: '1', tintRole: 'blue', printHex: '#38BDF8', order: 4 },
    { id: 'N5', char: '5', tintRole: 'blue', printHex: '#38BDF8', order: 5 },
  ];

  // Lọc ảnh trong khay
  const filteredDrawerPosts = useMemo(() => {
    return approvedPosts.filter((p) => {
      const matchSearch =
        !drawerSearch ||
        p.message.toLowerCase().includes(drawerSearch.toLowerCase()) ||
        p.department.toLowerCase().includes(drawerSearch.toLowerCase()) ||
        `#${p.id}`.includes(drawerSearch);

      if (!matchSearch) return false;

      if (drawerLetterFilter === 'ALL') return true;
      const placement = postPlacementMap.get(p.id);
      return placement?.tile?.letterId === drawerLetterFilter;
    });
  }, [approvedPosts, drawerSearch, drawerLetterFilter, postPlacementMap]);

  // Thông tin bài viết và ô đang được chọn hoặc hover
  const activeTileRank = hoveredRank !== null ? hoveredRank : selectedRank;
  const activeTileInfo = activeTileRank !== null ? rankToTileMap.get(activeTileRank) : null;
  const activePost = activeTileRank !== null ? postMap.get(order[activeTileRank]) : null;

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
                  <span>Điều Phối Bố Cục Khảm 3D Trực Quan (IRIS 15)</span>
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
                  Nhấp hoặc kéo thả ảnh trực tiếp vào bất kỳ vị trí ô nào trên mô hình chữ IRIS 15.
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
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:brightness-110 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {publishStep === 1
                      ? '1/3 Dựng cấu hình...'
                      : publishStep === 2
                      ? '2/3 Dựng Atlas HD...'
                      : '3/3 Lưu CDN Cloudflare...'}
                  </span>
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

      {/* 2. Interactive Selection Guidance Bar */}
      {(selectedRank !== null || selectedDrawerPostId !== null) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <ArrowLeftRight className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            {selectedRank !== null ? (
              <span>
                Đang chọn: <strong>Ô #{selectedRank + 1}</strong> (
                {rankToTileMap.get(selectedRank)?.letterId.startsWith('G') ? 'Chữ IRIS' : 'Số 15'} - Bài #{order[selectedRank]})
                {' '}&rarr; <em>Nhấp vào ô khác trên mô hình</em> để hoán đổi, HOẶC <em>nhấp ảnh trong kho bên dưới</em> để đặt vào ô này!
              </span>
            ) : (
              <span>
                Đang chọn ảnh: <strong>Bài #{selectedDrawerPostId}</strong> (
                {postMap.get(selectedDrawerPostId!)?.department}) &rarr; <em>Nhấp vào ô bất kỳ trên mô hình chữ IRIS 15 ở trên</em> để đặt ảnh vào ô đó!
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedRank(null);
              setSelectedDrawerPostId(null);
            }}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 transition-colors"
          >
            Hủy chọn (✕)
          </button>
        </motion.div>
      )}

      {/* 3. MÔ HÌNH KHẢM TRỰC QUAN IRIS 15 (2D Interactive Board) */}
      <div className="bg-brand-card border border-brand-border p-4 sm:p-5 rounded-2xl space-y-4 shadow-sm">
        {/* Toolbar: Tiêu đề + Zoom + Bộ lọc Chữ cái */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-brand-border/60">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-secondary" />
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-brand-textPrimary">
              Mô Hình Khảm Trực Quan Chữ IRIS 15
            </h4>
            <span className="text-[11px] font-mono text-brand-textMuted bg-brand-surface px-2 py-0.5 rounded-full border border-brand-border">
              {layout?.tiles?.length || order.length} ô ảnh
            </span>
          </div>

          {/* Letter filter buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedLetterFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedLetterFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'bg-brand-surface text-brand-textSecondary hover:text-brand-textPrimary border border-brand-border/60'
              }`}
            >
              Tất cả (I R I S 1 5)
            </button>
            {letters.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedLetterFilter(l.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                  selectedLetterFilter === l.id
                    ? l.tintRole === 'gold'
                      ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                      : 'bg-sky-400 text-slate-950 font-black shadow-md'
                    : 'bg-brand-surface text-brand-textSecondary hover:text-brand-textPrimary border border-brand-border/60'
                }`}
              >
                <span>Chữ {l.char}</span>
              </button>
            ))}

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-brand-border/60">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(100, z - 40))}
                disabled={zoomLevel <= 100}
                className="p-1 rounded-md text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface disabled:opacity-30"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono font-bold text-brand-textMuted w-9 text-center">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(180, z + 40))}
                disabled={zoomLevel >= 180}
                className="p-1 rounded-md text-brand-textSecondary hover:text-brand-textPrimary hover:bg-brand-surface disabled:opacity-30"
                title="Phóng to"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 2D Canvas Container */}
        <div
          ref={boardScrollRef}
          className="overflow-x-auto custom-scrollbar pb-2 rounded-xl bg-slate-950/90 border border-brand-border/80 shadow-inner p-2 sm:p-4"
        >
          <div
            className="relative transition-all duration-200 mx-auto"
            style={{
              width: `${zoomLevel}%`,
              minWidth: '680px',
              aspectRatio: `${cols} / ${rows}`,
            }}
          >
            {/* Lớp nền chữ cái gợi ý */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-around opacity-5 select-none font-black text-white text-6xl tracking-widest">
              <span>I</span>
              <span>R</span>
              <span>I</span>
              <span>S</span>
              <span>1</span>
              <span>5</span>
            </div>

            {/* Render từng ô khảm */}
            {layout?.tiles.map((t) => {
              const assignedPostId = order[t.rank];
              const post = postMap.get(assignedPostId);
              const isVip = t.rank === 0;
              const isSelected = selectedRank === t.rank;
              const isDragOver = dragOverRank === t.rank;
              const isDimmed = selectedLetterFilter !== 'ALL' && t.letterId !== selectedLetterFilter;
              const isGold = t.letterId.startsWith('G');

              // Tọa độ chuẩn hóa theo phần trăm
              const leftPct = (t.u[0] / cols) * 100;
              const topPct = (t.u[1] / rows) * 100;
              const widthPct = (t.u[2] / cols) * 100;
              const heightPct = (t.u[3] / rows) * 100;

              return (
                <div
                  key={t.i}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                  className="p-[1px]"
                >
                  <div
                    draggable={true}
                    onDragStart={(e) => handleTileDragStart(e, t.rank)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverRank(t.rank);
                    }}
                    onDragLeave={() => setDragOverRank(null)}
                    onDrop={(e) => handleTileDrop(e, t.rank)}
                    onClick={() => handleTileClick(t.rank)}
                    onMouseEnter={() => setHoveredRank(t.rank)}
                    onMouseLeave={() => setHoveredRank(null)}
                    className={`group relative w-full h-full cursor-pointer select-none transition-all duration-150 overflow-hidden ${
                      isSelected
                        ? 'z-40 ring-2 ring-amber-400 scale-110 shadow-2xl rounded-md'
                        : isDragOver
                        ? 'z-40 ring-2 ring-emerald-400 scale-105 rounded-md'
                        : isDimmed
                        ? 'opacity-20 grayscale hover:opacity-100 hover:grayscale-0'
                        : 'hover:z-30 hover:scale-115 hover:shadow-xl rounded-[2px]'
                    } ${
                      isGold
                        ? 'border border-amber-500/50 bg-amber-950/30'
                        : 'border border-sky-500/50 bg-sky-950/30'
                    }`}
                  >
                    {post ? (
                      <img
                        src={post.thumbnailUrl || post.thumbnailImagePath || '/placeholder.png'}
                        alt=""
                        className="w-full h-full object-cover pointer-events-none"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-900/80 flex items-center justify-center text-[7px] text-slate-500">
                        #{t.rank + 1}
                      </div>
                    )}

                    {/* Huy hiệu Hero VIP #1 */}
                    {isVip && (
                      <div className="absolute top-0 right-0 px-1 py-0.5 bg-amber-500 text-slate-950 font-black text-[7px] leading-none rounded-bl flex items-center gap-0.5 shadow-md">
                        ★ VIP
                      </div>
                    )}

                    {/* Nhãn thứ tự ô */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-[1px] text-white text-[7px] px-0.5 py-0.2 truncate transition-opacity flex items-center justify-between ${
                        isSelected
                          ? 'opacity-100 font-bold text-amber-300'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <span>#{t.rank + 1}</span>
                      {post && <span className="truncate ml-1 opacity-75">{post.department}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Inspector Bar: Xem thông tin chi tiết ô đang hover hoặc chọn */}
        <div className="p-3 rounded-xl bg-brand-surface/70 border border-brand-border flex flex-wrap items-center justify-between gap-3 text-xs">
          {activeTileInfo && activePost ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-brand-border shrink-0 bg-black">
                <img
                  src={activePost.thumbnailUrl || activePost.thumbnailImagePath}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-brand-textPrimary">
                    Ô #{activeTileRank! + 1}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                      activeTileInfo.letterId.startsWith('G')
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    Chữ {activeTileInfo.letterId}
                  </span>
                  <span className="font-bold text-brand-secondary">{activePost.department}</span>
                  <span className="text-rose-400 font-bold flex items-center gap-0.5">
                    <Heart className="w-3 h-3 fill-rose-500/20" />
                    {activePost.voteCount}
                  </span>
                </div>
                <p className="text-[11px] text-brand-textSecondary truncate max-w-xl">
                  "{activePost.message}"
                </p>
              </div>
            </div>
          ) : (
            <div className="text-brand-textMuted flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-brand-secondary shrink-0" />
              <span>
                Di chuột lên ô để xem chi tiết ảnh. Nhấp hoặc kéo thả ô để hoán đổi vị trí bất kỳ trên chữ IRIS 15.
              </span>
            </div>
          )}

          {/* Quick Presets Toolbar */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <span className="text-[11px] font-semibold text-brand-textMuted mr-1">Tự động:</span>
            <button
              type="button"
              onClick={sortByVotes}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-brand-surface hover:bg-brand-surfaceHover border border-brand-border text-brand-textPrimary transition-colors"
              title="Xếp theo số lượt vote cao nhất chiếm các ô trung tâm lớn"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Theo Vote</span>
            </button>
            <button
              type="button"
              onClick={sortByDepartment}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-brand-surface hover:bg-brand-surfaceHover border border-brand-border text-brand-textPrimary transition-colors"
              title="Phân bổ xen kẽ các phòng ban để bức khảm phong phú màu sắc"
            >
              <Building2 className="w-3.5 h-3.5 text-brand-secondary" />
              <span>Xen kẽ Phòng</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surface transition-colors"
              title="Khôi phục lại mặc định ban đầu"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. KHAY ẢNH ĐÃ DUYỆT (Photo Tray & Selector) */}
      <div className="bg-brand-surface border border-brand-border p-4 sm:p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-border/60">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-brand-textPrimary flex items-center gap-2">
              <span>Kho Ảnh Kỷ Niệm Đã Duyệt</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand-surfaceHover text-brand-textSecondary border border-brand-border">
                {filteredDrawerPosts.length} / {approvedPosts.length} ảnh
              </span>
            </h4>
            <p className="text-[11px] text-brand-textSecondary mt-0.5">
              Kéo ảnh từ khay này thả vào ô bất kỳ trên mô hình, hoặc nhấp ảnh rồi nhấp ô để gán vị trí.
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 text-brand-textMuted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm phòng ban, nội dung..."
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-textPrimary focus:outline-none focus:border-brand-primary"
              />
              {drawerSearch && (
                <button
                  type="button"
                  onClick={() => setDrawerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-textMuted hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={drawerLetterFilter}
              onChange={(e) => setDrawerLetterFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">Mọi chữ cái</option>
              <option value="GI1">Chữ I (đầu)</option>
              <option value="GR">Chữ R</option>
              <option value="GI2">Chữ I (sau)</option>
              <option value="GS">Chữ S</option>
              <option value="N1">Số 1</option>
              <option value="N5">Số 5</option>
            </select>
          </div>
        </div>

        {/* Grid cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[460px] overflow-y-auto custom-scrollbar p-1">
          {filteredDrawerPosts.map((post) => {
            const placement = postPlacementMap.get(post.id);
            const isSelected = selectedDrawerPostId === post.id;
            const isHero = placement?.rank === 0;

            return (
              <div
                key={post.id}
                draggable={true}
                onDragStart={(e) => handleDrawerDragStart(e, post.id)}
                onClick={() => handleDrawerCardClick(post.id)}
                className={`relative rounded-xl border p-2 flex flex-col justify-between gap-2 cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'ring-2 ring-amber-400 bg-amber-500/10 border-amber-400 shadow-md scale-[1.02]'
                    : 'bg-brand-card hover:bg-brand-surfaceHover border-brand-border/70 hover:border-brand-primary/60'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-square rounded-lg overflow-hidden border border-brand-border/60 bg-black group">
                  <img
                    src={post.thumbnailUrl || post.thumbnailImagePath || '/placeholder.png'}
                    alt=""
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 pointer-events-none"
                    loading="lazy"
                  />

                  {/* Vị trí badge trên thumbnail */}
                  <div
                    className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black shadow-sm ${
                      isHero
                        ? 'bg-amber-400 text-slate-950 font-black'
                        : placement?.isGold
                        ? 'bg-amber-500/85 text-slate-950'
                        : 'bg-sky-500/85 text-white'
                    }`}
                  >
                    {isHero ? '★ VIP' : `#${(placement?.rank ?? 0) + 1}`}
                  </div>

                  {/* Nút phóng to preview */}
                  {onOpenPreview && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPreview(post);
                      }}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                      title="Xem ảnh lớn"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-bold text-brand-secondary truncate">{post.department}</span>
                    <span className="text-rose-400 font-bold shrink-0 flex items-center gap-0.5">
                      <Heart className="w-2.5 h-2.5 fill-rose-500/20" />
                      {post.voteCount}
                    </span>
                  </div>

                  <p className="text-[11px] text-brand-textPrimary line-clamp-2 leading-snug">
                    {post.message}
                  </p>

                  {/* Placement tag */}
                  <div className="pt-1 border-t border-brand-border/40 flex items-center justify-between text-[10px]">
                    <span
                      className={`font-mono font-bold px-1.5 py-0.2 rounded border ${
                        placement?.isGold
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      }`}
                    >
                      Chữ {placement?.letterChar || 'I'} • Ô #{((placement?.rank ?? 0) + 1)}
                    </span>

                    {isSelected && (
                      <span className="text-amber-400 font-bold text-[9px]">Đang chọn</span>
                    )}
                  </div>
                </div>
              </div>
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
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
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
