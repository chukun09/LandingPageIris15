import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, UploadCloud, AlertCircle, Sparkles } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (message: string, department: string, file: File) => Promise<boolean>;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [message, setMessage] = useState('');
  const [department, setDepartment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setDepartment('');
      setFile(null);
      setFilePreview(null);
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleFileChange = (selectedFile: File) => {
    // SVG đã bị loại: máy chủ không giải mã được SVG nên ảnh sẽ hỏng âm thầm.
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const extension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    if (!allowed.includes(extension)) {
      setErrorMsg('Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, JPEG, PNG, WEBP.');
      setFile(null);
      setFilePreview(null);
      return;
    }

    setErrorMsg('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target && typeof e.target.result === 'string') {
        setFilePreview(e.target.result);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) { setErrorMsg('Vui lòng nhập nội dung lời chúc.'); return; }
    if (!file) { setErrorMsg('Vui lòng chọn hình ảnh kỷ niệm của bạn.'); return; }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const success = await onSubmit(message, department, file);
      if (success) onClose();
    } catch {
      setErrorMsg('Có lỗi xảy ra khi tải lên. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-brand-border flex items-center justify-between">
          <h3 className="text-lg font-black text-brand-textPrimary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-secondary" /> Gửi kỷ niệm của bạn
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-brand-textMuted hover:text-brand-textPrimary hover:bg-brand-surfaceHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                className="bg-brand-danger/10 border border-brand-danger/25 p-3.5 rounded-xl flex items-start gap-2 text-brand-danger text-xs font-semibold"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Department */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-brand-textSecondary">Phòng Ban / Bộ Phận *</label>
            <div className="relative">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-themed w-full px-4 py-2.5 text-sm cursor-pointer bg-brand-surface text-brand-textPrimary appearance-none pr-10"
                required
              >
                <option value="" disabled hidden>-- Chọn phòng ban / bộ phận --</option>
                <option value="Hội đồng quản trị">Hội đồng quản trị</option>
                <option value="Ban Tổng giám đốc">Ban Tổng giám đốc</option>
                <option value="Kỹ thuật vận hành">Kỹ thuật vận hành</option>
                <option value="Phát triển phần mềm">Phát triển phần mềm</option>
                <option value="Sản phẩm">Sản phẩm</option>
                <option value="Phát triển kinh doanh">Phát triển kinh doanh</option>
                <option value="P Kinh doanh">P Kinh doanh</option>
                <option value="Văn phòng Hồ Chí Minh">Văn phòng Hồ Chí Minh</option>
                <option value="Đối soát vận hành">Đối soát vận hành</option>
                <option value="Chăm sóc khách hàng">Chăm sóc khách hàng</option>
                <option value="Kế toán">Kế toán</option>
                <option value="Hành chính nhân sự">Hành chính nhân sự</option>
                <option value="Lái xe">Lái xe</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-brand-textSecondary">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-brand-textSecondary">Lời chúc mừng sinh nhật IRIS 15 tuổi *</label>
            <textarea
              rows={4}
              placeholder="Nhập lời chúc, kỷ niệm đáng nhớ của bạn tại công ty..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input-themed w-full px-4 py-2.5 text-sm resize-none"
              required
            />
          </div>

          {/* File Dropzone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-brand-textSecondary">Hình ảnh kỷ niệm *</label>
            <motion.div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              animate={{ scale: isDragOver ? 1.02 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-brand-secondary bg-brand-secondary/10'
                  : 'border-brand-border bg-brand-surface hover:bg-brand-surfaceHover hover:border-brand-secondary/60'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp"
              />
              <motion.div animate={isDragOver ? { y: -4 } : { y: 0 }} transition={{ duration: 0.2 }}>
                <UploadCloud className="w-10 h-10 text-brand-textMuted mx-auto mb-2" />
              </motion.div>
              <p className="text-xs text-brand-textSecondary font-semibold">
                Kéo thả file ảnh hoặc click vào đây để chọn
              </p>
              <p className="text-[10px] text-brand-textMuted mt-1">
                Hỗ trợ JPG, JPEG, PNG, WEBP (Tối đa 10MB)
              </p>
            </motion.div>
          </div>

          {/* File Preview */}
          <AnimatePresence>
            {filePreview && (
              <motion.div
                className="space-y-1.5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <label className="block text-xs font-bold text-brand-textSecondary">Xem trước hình ảnh</label>
                <div className="relative w-full aspect-video bg-brand-surface rounded-xl border border-brand-border overflow-hidden">
                  <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setFilePreview(null); }}
                    className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-white hover:bg-slate-900 p-1 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="border-t border-brand-border pt-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-brand-border text-brand-textSecondary hover:bg-brand-surface font-bold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              className="btn-gold px-5 py-2.5 text-xs flex items-center gap-1.5 disabled:opacity-70"
              whileTap={{ scale: 0.95 }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-900/70 border-t-transparent rounded-full animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi lời chúc'
              )}
            </motion.button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
};
