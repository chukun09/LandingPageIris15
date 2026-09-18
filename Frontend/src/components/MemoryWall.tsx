import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, Heart, Filter, ArrowUpDown, Calendar, ChevronLeft, ChevronRight, Sparkles, Download, MapPin } from 'lucide-react';
import { staggerContainer, fadeUp, sectionViewport } from '../lib/motion';
import { fireCelebration } from './CelebrationConfetti';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
}

interface MemoryWallProps {
  posts: Post[];
  onVote: (id: number) => void;
  onCardClick: (post: Post) => void;
  onExportCard?: (post: Post) => void;
  onLocatePost?: (post: Post) => void;
  selectedDepartment?: string;
}

export const MemoryWall: React.FC<MemoryWallProps> = ({
  posts,
  onVote,
  onCardClick,
  onExportCard,
  onLocatePost,
  selectedDepartment,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState(selectedDepartment || 'All');
  const [sortBy, setSortBy] = useState<'votes' | 'date'>('votes');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (selectedDepartment !== undefined) {
      setDeptFilter(selectedDepartment);
    }
  }, [selectedDepartment]);

  const POSTS_PER_PAGE = 9;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, deptFilter, sortBy]);

  const departments = useMemo(() => {
    const list = new Set<string>();
    posts.forEach(p => {
      if (p.department && p.department.trim()) list.add(p.department.trim());
    });
    return ['All', ...Array.from(list)];
  }, [posts]);

  const filteredAndSortedPosts = useMemo(() => {
    let result = [...posts];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.message.toLowerCase().includes(q) ||
        (p.department && p.department.toLowerCase().includes(q))
      );
    }
    if (deptFilter !== 'All') {
      result = result.filter(p => p.department === deptFilter);
    }
    result.sort((a, b) => {
      if (sortBy === 'votes') {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return result;
  }, [posts, search, deptFilter, sortBy]);

  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    return filteredAndSortedPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);
  }, [filteredAndSortedPosts, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedPosts.length / POSTS_PER_PAGE);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const gridKey = `${currentPage}-${deptFilter}-${search}-${sortBy}`;

  return (
    <div className="w-full">
      {/* Filters Bar */}
      <div className="glass-card p-5 mb-8 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-brand-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm lời chúc, phòng ban..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-themed w-full pl-10 pr-4 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brand-textMuted" />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="input-themed px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {departments.map((dept, idx) => (
                <option key={idx} value={dept}>
                  {dept === 'All' ? 'Tất cả phòng ban' : dept}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-brand-textMuted" />
            <button
              onClick={() => setSortBy(sortBy === 'votes' ? 'date' : 'votes')}
              className="bg-brand-surface border border-brand-border hover:border-brand-primary hover:text-brand-textPrimary rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 text-brand-textSecondary transition-all"
            >
              {sortBy === 'votes' ? 'Thả tim nhiều nhất' : 'Mới nhất trước'}
            </button>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredAndSortedPosts.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <Sparkles className="w-8 h-8 text-brand-secondary/50 mx-auto mb-3" />
          <p className="text-brand-textSecondary text-sm font-semibold">Không tìm thấy kỷ niệm nào phù hợp.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={gridKey}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
            >
              {paginatedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  layout
                  variants={fadeUp}
                  className="card-premium card-polaroid flex flex-col justify-between overflow-hidden group cursor-pointer border border-brand-border hover:border-brand-secondary/50 rounded-2xl bg-brand-card shadow-sm"
                  onClick={() => onCardClick(post)}
                >
                  {/* Photo */}
                  <div className="relative aspect-video w-full overflow-hidden bg-brand-surface border-b border-brand-border/60">
                    <img
                      src={post.thumbnailUrl || post.thumbnailImagePath}
                      alt="Memory thumbnail"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) parent.style.backgroundColor = 'transparent';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-3">
                      <span className="text-white text-xs font-bold bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md">
                        Xem chi tiết
                      </span>
                      {onLocatePost && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLocatePost(post);
                          }}
                          className="text-amber-300 hover:text-white text-xs font-bold bg-amber-950/80 hover:bg-amber-600 border border-amber-500/40 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
                          title="Định vị vị trí trên chữ IRIS 15"
                        >
                          <MapPin className="w-3 h-3" /> Tìm trên 3D
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-brand-textPrimary font-normal line-clamp-4 leading-relaxed mb-4 whitespace-pre-line">
                      {post.message}
                    </p>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-border/50">
                      <div className="flex flex-col items-start gap-1">
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary dark:bg-brand-secondary/15 dark:text-brand-secondary truncate max-w-[120px]">
                          {post.department || 'Ẩn danh'}
                        </span>
                        <span className="text-[10px] text-brand-textMuted font-fira flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" /> {formatDate(post.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onExportCard && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onExportCard(post);
                            }}
                            className="p-1.5 rounded-full text-brand-textMuted hover:text-brand-secondary hover:bg-brand-surfaceHover transition-colors"
                            title="Tải thiệp lưu niệm cá nhân"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            fireCelebration(e.clientX, e.clientY);
                            onVote(post.id);
                          }}
                          className="flex items-center gap-1.5 bg-brand-danger/5 hover:bg-brand-danger hover:text-white border border-brand-danger/25 text-brand-danger font-bold font-fira px-3 py-1.5 rounded-full text-[10px] transition-all duration-300"
                          whileTap={{ scale: 0.8 }}
                          title="Thả tim bình chọn"
                        >
                          <Heart className="w-3 h-3 fill-current" /> {post.voteCount}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-brand-border pt-6 mt-8">
              <motion.button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3.5 py-2 border border-brand-border rounded-xl text-xs font-semibold bg-brand-card text-brand-textSecondary hover:bg-brand-surface disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 flex items-center gap-1"
                whileTap={{ scale: 0.95 }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </motion.button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-brand-textSecondary font-semibold md:hidden">
                  Trang {currentPage} / {totalPages}
                </span>
                <div className="hidden md:flex items-center gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <motion.button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 rounded-xl text-xs font-semibold transition-all animate-fadeIn ${
                        page === currentPage
                          ? 'bg-brand-primary text-white shadow-md dark:shadow-glow-primary'
                          : 'bg-brand-card border border-brand-border hover:bg-brand-surface text-brand-textSecondary'
                      }`}
                      whileTap={{ scale: 0.9 }}
                    >
                      {page}
                    </motion.button>
                  ))}
                </div>
              </div>

              <motion.button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-3.5 py-2 border border-brand-border rounded-xl text-xs font-semibold bg-brand-card text-brand-textSecondary hover:bg-brand-surface disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 flex items-center gap-1"
                whileTap={{ scale: 0.95 }}
              >
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
