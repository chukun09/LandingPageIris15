import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, X, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg('');
      setIsShaking(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (password === 'iris2026@@') {
      onSuccess();
      onClose();
    } else {
      setErrorMsg('Mật khẩu quản trị không chính xác!');
      setIsShaking(true);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-sm">
      <motion.div
        animate={isShaking ? { x: [0, -6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.45 }}
        onAnimationComplete={() => setIsShaking(false)}
        className="p-6"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <form onSubmit={handleSubmit} className="space-y-5 text-center mt-2">
          {/* Lock Icon */}
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center mx-auto text-brand-primary shadow-glow-primary/30">
            <Lock className="w-5 h-5" />
          </div>

          <div>
            <h3 className="text-base font-black text-brand-textPrimary">Xác thực Quản trị</h3>
            <p className="text-[11px] text-brand-textSecondary mt-1">
              Vui lòng nhập mật khẩu quản lý sự kiện để tiếp tục.
            </p>
          </div>

          {/* Password Input */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nhập mật khẩu..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-themed w-full pl-3 pr-10 py-2.5 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-textMuted hover:text-brand-textPrimary p-0.5"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                className="bg-brand-danger/10 border border-brand-danger/25 p-2.5 rounded-xl flex items-center gap-2 text-brand-danger text-[10px] font-semibold text-left animate-fadeIn"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-brand-border hover:bg-brand-surface text-brand-textSecondary font-bold text-xs rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <motion.button
              type="submit"
              className="flex-1 py-2 bg-brand-primary hover:brightness-110 text-white font-bold text-xs rounded-xl transition-all shadow-md"
              whileTap={{ scale: 0.95 }}
            >
              Xác nhận
            </motion.button>
          </div>
        </form>
      </motion.div>
    </ModalShell>
  );
};
