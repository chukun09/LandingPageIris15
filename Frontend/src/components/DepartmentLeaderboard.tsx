import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Trophy, Flame } from 'lucide-react';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
}

interface DepartmentLeaderboardProps {
  posts: Post[];
  selectedDepartment: string;
  onSelectDepartment: (dept: string) => void;
}

export const DepartmentLeaderboard: React.FC<DepartmentLeaderboardProps> = ({
  posts,
  selectedDepartment,
  onSelectDepartment,
}) => {
  const departmentStats = useMemo(() => {
    const map = new Map<string, { count: number; votes: number }>();

    posts.forEach((p) => {
      const dept = (p.department && p.department.trim()) ? p.department.trim() : 'Khác / Ẩn danh';
      const curr = map.get(dept) || { count: 0, votes: 0 };
      map.set(dept, {
        count: curr.count + 1,
        votes: curr.votes + p.voteCount,
      });
    });

    const list = Array.from(map.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      votes: data.votes,
    }));

    // Sắp xếp theo số lượng kỷ niệm đóng góp nhiều nhất
    list.sort((a, b) => b.count - a.count || b.votes - a.votes);
    return list;
  }, [posts]);

  if (departmentStats.length === 0) return null;

  return (
    <div className="glass-card p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-brand-border/70 pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-black text-brand-textPrimary">
            Bản Đồ Mảnh Ghép Phòng Ban
          </h3>
        </div>
        <span className="text-[11px] text-brand-textMuted font-mono">
          {posts.length} KỶ NIỆM ĐÃ GÓP
        </span>
      </div>

      <p className="text-xs text-brand-textSecondary">
        Xem phòng ban nào đang dẫn đầu cuộc đua thắp sáng bức tranh IRIS 15 năm:
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {departmentStats.slice(0, 6).map((dept, index) => {
          const isSelected = selectedDepartment === dept.name;
          const isTop1 = index === 0;

          return (
            <motion.div
              key={dept.name}
              onClick={() => onSelectDepartment(isSelected ? 'All' : dept.name)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className={`p-3 rounded-xl border cursor-pointer transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-brand-primary/20 border-brand-secondary text-brand-textPrimary shadow-md'
                  : 'bg-brand-surface/70 border-brand-border hover:bg-brand-surfaceHover text-brand-textSecondary'
              }`}
            >
              {isTop1 && (
                <span className="absolute top-1.5 right-1.5 flex items-center text-amber-500">
                  <Flame className="w-3.5 h-3.5 animate-pulse fill-current" />
                </span>
              )}

              <div className="flex items-center gap-1.5 mb-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  index === 0 ? 'bg-amber-500 text-slate-950' :
                  index === 1 ? 'bg-slate-300 text-slate-950' :
                  index === 2 ? 'bg-amber-700 text-white' :
                  'bg-brand-surface border border-brand-border text-brand-textMuted'
                }`}>
                  {index + 1}
                </span>
                <span className="text-xs font-bold truncate block" title={dept.name}>
                  {dept.name}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-brand-textMuted font-fira border-t border-brand-border/40 pt-1.5">
                <span className="font-bold text-brand-secondary">{dept.count} ảnh</span>
                <span>{dept.votes} ❤️</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
