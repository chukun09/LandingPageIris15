import React, { useRef, useState, useEffect } from 'react';
import { Download, X, Sparkles } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface Post {
  id: number;
  message: string;
  department: string;
  thumbnailImagePath?: string;
  thumbnailUrl?: string;
  voteCount: number;
  createdAt: string;
}

interface MemoryCardExportModalProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryCardExportModal: React.FC<MemoryCardExportModalProps> = ({
  post,
  isOpen,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>('light');
  const [isGenerating, setIsGenerating] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !post) {
      setDownloadUrl(null);
      return;
    }

    setIsGenerating(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLight = cardTheme === 'light';

    // Kích thước chuẩn Story / Card 4:5 sắc nét: 1080 x 1350
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;

    // 1. Vẽ nền Gradient (Nền Sáng Giấy Ngà Ấm hoặc Nền Tối Hoàng Gia)
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    if (isLight) {
      bgGradient.addColorStop(0, '#FCFBF8');
      bgGradient.addColorStop(0.5, '#F8F4EA');
      bgGradient.addColorStop(1, '#F0E7D5');
    } else {
      bgGradient.addColorStop(0, '#0B0F19');
      bgGradient.addColorStop(0.5, '#111827');
      bgGradient.addColorStop(1, '#070A10');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Hoa văn viền vàng kim nghệ thuật (Double Gold Border)
    const primaryGold = isLight ? '#C88D2A' : '#D4AF37';
    const subGold = isLight ? 'rgba(200, 141, 42, 0.45)' : 'rgba(212, 175, 55, 0.4)';

    ctx.strokeStyle = primaryGold;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);

    ctx.strokeStyle = subGold;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(52, 52, width - 104, height - 104);

    // Bốn góc trang trí
    const corners = [
      [40, 40],
      [width - 40, 40],
      [40, height - 40],
      [width - 40, height - 40],
    ];
    ctx.fillStyle = primaryGold;
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Header: Kỷ niệm 15 năm IRIS
    ctx.textAlign = 'center';
    ctx.fillStyle = isLight ? '#A6701A' : '#F5D77F';
    ctx.font = 'bold 26px "Montserrat", sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('2011 — 2026 · KỶ NIỆM 15 NĂM', width / 2, 110);

    ctx.fillStyle = isLight ? '#1E3F8C' : '#FFFFFF';
    ctx.font = '900 48px "Archivo", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('IRIS ANNIVERSARY', width / 2, 170);

    ctx.fillStyle = isLight ? '#5C6980' : 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'italic 20px "Be Vietnam Pro", sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('“Mỗi Kỷ Niệm — Một Mảnh Ghép Thắp Sáng Hành Trình Vàng”', width / 2, 210);

    // Đường kẻ phân cách vàng kim
    const sepGrad = ctx.createLinearGradient(width / 2 - 200, 0, width / 2 + 200, 0);
    sepGrad.addColorStop(0, 'transparent');
    sepGrad.addColorStop(0.5, primaryGold);
    sepGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = sepGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 200, 240);
    ctx.lineTo(width / 2 + 200, 240);
    ctx.stroke();

    // 4. Vẽ ảnh kỷ niệm
    const photoImg = new Image();
    photoImg.crossOrigin = 'anonymous';
    const photoUrl = post.thumbnailUrl || post.thumbnailImagePath || '';

    const drawRemainingContent = () => {
      // Khung ảnh
      const imgX = 140;
      const imgY = 270;
      const imgW = width - 280;
      const imgH = 500;

      ctx.save();
      ctx.strokeStyle = primaryGold;
      ctx.lineWidth = 3;
      ctx.strokeRect(imgX - 4, imgY - 4, imgW + 8, imgH + 8);

      // Bo góc ảnh
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgW, imgH, 16);
      ctx.clip();

      if (photoImg.complete && photoImg.naturalWidth > 0) {
        // Vẽ cover
        const hRatio = imgW / photoImg.width;
        const vRatio = imgH / photoImg.height;
        const ratio = Math.max(hRatio, vRatio);
        const centerShiftX = (imgW - photoImg.width * ratio) / 2;
        const centerShiftY = (imgH - photoImg.height * ratio) / 2;
        ctx.drawImage(
          photoImg,
          0,
          0,
          photoImg.width,
          photoImg.height,
          imgX + centerShiftX,
          imgY + centerShiftY,
          photoImg.width * ratio,
          photoImg.height * ratio
        );
      } else {
        ctx.fillStyle = isLight ? '#EAE5D9' : '#1E293B';
        ctx.fillRect(imgX, imgY, imgW, imgH);
        ctx.fillStyle = isLight ? '#7C8BA1' : '#94A3B8';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('Hình ảnh kỷ niệm IRIS 15', width / 2, imgY + imgH / 2);
      }
      ctx.restore();

      // 5. Khung chứa Lời chúc (Quote box)
      const quoteBoxY = 810;
      const quoteBoxH = 340;
      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = isLight ? 'rgba(200, 141, 42, 0.4)' : 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(140, quoteBoxY, imgW, quoteBoxH, 16);
      ctx.fill();
      ctx.stroke();

      // Dấu ngoặc kép lớn
      ctx.fillStyle = isLight ? 'rgba(200, 141, 42, 0.35)' : 'rgba(212, 175, 55, 0.3)';
      ctx.font = 'bold 80px serif';
      ctx.textAlign = 'left';
      ctx.fillText('“', 165, quoteBoxY + 70);

      // Nội dung lời chúc (chia dòng văn bản)
      ctx.fillStyle = isLight ? '#1A253B' : '#F1F5F9';
      ctx.font = '24px "Be Vietnam Pro", sans-serif';
      ctx.letterSpacing = '0px';

      const words = post.message.split(' ');
      let line = '';
      let textY = quoteBoxY + 80;
      const maxWidth = imgW - 80;
      const lineHeight = 38;
      const maxLines = 5;
      let lineCount = 0;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, 180, textY);
          line = words[n] + ' ';
          textY += lineHeight;
          lineCount++;
          if (lineCount >= maxLines - 1) {
            line += '...';
            break;
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 180, textY);

      // Phòng ban & Ngày tháng
      ctx.fillStyle = isLight ? '#A6701A' : '#F5D77F';
      ctx.font = 'bold 22px "Montserrat", sans-serif';
      ctx.fillText(`Phòng ban: ${post.department || 'Đại gia đình IRIS'}`, 180, quoteBoxY + quoteBoxH - 50);

      ctx.fillStyle = isLight ? '#5C6980' : '#94A3B8';
      ctx.font = '18px "Fira Code", monospace';
      const dateStr = new Date(post.createdAt).toLocaleDateString('vi-VN');
      ctx.fillText(`Thời gian: ${dateStr}`, 180, quoteBoxY + quoteBoxH - 22);

      // 6. Con dấu chứng nhận vàng (Golden Seal Stamp)
      const sealX = width - 240;
      const sealY = quoteBoxY + quoteBoxH - 55;

      ctx.save();
      ctx.translate(sealX, sealY);
      ctx.rotate(-0.08);

      ctx.strokeStyle = primaryGold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = subGold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isLight ? '#A6701A' : '#D4AF37';
      ctx.font = 'bold 12px "Montserrat", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OFFICIAL MEMORY', 0, -18);
      ctx.font = '900 18px "Archivo", sans-serif';
      ctx.fillText('IRIS 15', 0, 4);
      ctx.font = 'bold 11px "Montserrat", sans-serif';
      ctx.fillText('YEARS OF PRIDE', 0, 22);
      ctx.restore();

      // 7. Footer
      ctx.textAlign = 'center';
      ctx.fillStyle = isLight ? '#5C6980' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '16px "Fira Code", monospace';
      ctx.fillText('www.iris.vn · Tự Hào Chặng Đường Vàng 2011 - 2026', width / 2, 1260);

      setDownloadUrl(canvas.toDataURL('image/png'));
      setIsGenerating(false);
    };

    if (photoUrl) {
      photoImg.src = photoUrl;
      photoImg.onload = drawRemainingContent;
      photoImg.onerror = drawRemainingContent;
    } else {
      drawRemainingContent();
    }
  }, [isOpen, post, cardTheme]);

  const handleDownload = () => {
    if (!downloadUrl || !post) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `IRIS15_KyNiem_${post.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-between w-full border-b border-brand-border pb-3">
          <h3 className="text-sm font-black text-brand-textPrimary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-secondary" /> Thiệp Kỷ Niệm Cá Nhân IRIS 15
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-brand-textMuted hover:text-brand-textPrimary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-brand-textSecondary">
          Bức thiệp mạ vàng chứng nhận mảnh ghép kỷ niệm của bạn, đã được định dạng sẵn tỉ lệ Story để dễ dàng chia sẻ lên mạng xã hội!
        </p>

        {/* Bộ chọn phong cách nền thiệp */}
        <div className="flex items-center gap-1.5 p-1 bg-brand-surface rounded-xl border border-brand-border w-full justify-center">
          <button
            type="button"
            onClick={() => setCardTheme('light')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              cardTheme === 'light'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-brand-textSecondary hover:text-brand-textPrimary'
            }`}
          >
            ☀️ Nền Sáng Hoàng Kim
          </button>
          <button
            type="button"
            onClick={() => setCardTheme('dark')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              cardTheme === 'dark'
                ? 'bg-slate-900 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-brand-textSecondary hover:text-brand-textPrimary'
            }`}
          >
            🌙 Nền Tối Hoàng Gia
          </button>
        </div>

        {/* Khung xem trước thiệp */}
        <div className={`relative w-full aspect-[4/5] rounded-xl overflow-hidden border border-brand-secondary/40 shadow-xl flex items-center justify-center transition-colors ${
          cardTheme === 'light' ? 'bg-[#F8F4EA]' : 'bg-slate-950'
        }`}>
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          {isGenerating && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${
              cardTheme === 'light' ? 'bg-[#F8F4EA]/85 text-amber-700' : 'bg-slate-950/80 text-brand-secondary'
            }`}>
              <div className="w-8 h-8 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono font-bold">ĐANG MẠ VÀNG THIỆP…</span>
            </div>
          )}
        </div>

        {/* Nút hành động */}
        <div className="flex items-center gap-3 w-full pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-brand-border text-xs font-bold text-brand-textSecondary hover:bg-brand-surface transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating || !downloadUrl}
            className="flex-1 btn-gold py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Tải thiệp về máy
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
