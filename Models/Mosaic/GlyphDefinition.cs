using LandingPageEvent.Configuration;

namespace LandingPageEvent.Models.Mosaic;

/// <summary>Hình chữ nhật trên lưới đơn vị. Gốc toạ độ ở góc trên-trái.</summary>
public readonly record struct LatticeRect(int X, int Y, int W, int H)
{
    public int Area => W * H;
    public int Right => X + W;
    public int Bottom => Y + H;
}

/// <summary>Một chữ cái: danh sách hình chữ nhật hợp thành, trong hộp cục bộ của nó.</summary>
public sealed record Glyph(string Id, string Char, int Width, IReadOnlyList<LatticeRect> Parts);

/// <summary>
/// Kết quả raster: lưới rows×cols, mỗi ô mang chỉ số chữ cái (-1 = nền).
/// </summary>
public sealed class GlyphRaster
{
    public required int Rows { get; init; }
    public required int Cols { get; init; }

    /// <summary>Chỉ số chữ cái theo hàng-trước; -1 nghĩa là ô nền.</summary>
    public required int[] LetterIndex { get; init; }

    public required IReadOnlyList<Glyph> Glyphs { get; init; }

    public int At(int x, int y) => LetterIndex[y * Cols + x];

    public int InkCount
    {
        get
        {
            var n = 0;
            foreach (var v in LetterIndex) if (v >= 0) n++;
            return n;
        }
    }
}

/// <summary>
/// Định nghĩa chữ "IRIS 15" bằng tham số thay vì ASCII art.
///
/// Mọi hình được mô tả trong hộp có chiều cao chữ hoa <c>cap</c> và bề rộng nét
/// <c>stroke</c>, nên đổi độ phân giải lưới không làm nét chữ mảnh đi — chỉ làm
/// biên chữ mịn hơn. Đây là lý do bức khảm giữ được độ đọc ở mọi số lượng ảnh.
/// </summary>
public static class IrisGlyphSet
{
    /// <summary>Dựng 6 chữ cái ở độ phân giải cho trước.</summary>
    public static IReadOnlyList<Glyph> Build(int cap, int stroke)
    {
        // Làm tròn về bội số thuận tiện để các mốc chia luôn rơi đúng ô lưới.
        int s = Math.Max(1, stroke);
        int h = Math.Max(s * 3, cap);

        // Các mốc dọc dùng chung.
        int midY = (h - s) / 2;          // mép trên của nét ngang giữa
        int botY = h - s;                // mép trên của nét ngang dưới

        int wI = s * 3;                                       // chữ I có chân
        int wR = Math.Max(s * 3, (int)Math.Round(h * 0.84));
        int wS = Math.Max(s * 3, (int)Math.Round(h * 0.80));  // S hẹp hơn 5
        int w1 = Math.Max(s * 2, (int)Math.Round(h * 0.56));
        int w5 = Math.Max(s * 3, (int)Math.Round(h * 0.86));

        return new List<Glyph>
        {
            new("I0", "I", wI, SerifI(wI, h, s)),
            new("R0", "R", wR, LetterR(wR, h, s, midY)),
            new("I1", "I", wI, SerifI(wI, h, s)),
            new("S0", "S", wS, LetterS(wS, h, s, midY, botY)),
            new("N1", "1", w1, Digit1(w1, h, s, botY)),
            new("N5", "5", w5, Digit5(w5, h, s, botY)),
        };
    }

    // Chữ I có chân: xà trên, thân giữa, xà dưới — cả ba đối xứng qua trục dọc.
    private static List<LatticeRect> SerifI(int w, int h, int s) => new()
    {
        new LatticeRect(0, 0, w, s),
        new LatticeRect((w - s) / 2, 0, s, h),
        new LatticeRect(0, h - s, w, s),
    };

    // Chữ R: thân trái, bụng trên, nét đứng phải của bụng, xà giữa, chân chéo bậc thang.
    private static List<LatticeRect> LetterR(int w, int h, int s, int midY)
    {
        var parts = new List<LatticeRect>
        {
            new(0, 0, s, h),                     // thân trái
            new(0, 0, w, s),                     // bụng trên
            new(w - s, 0, s, midY + s),          // cạnh phải của bụng
            new(0, midY, w, s),                  // xà giữa
        };
        // Chân chéo xuất phát từ giữa bụng chứ không từ mép thân, để quãng ngang
        // ngắn lại và các bậc chồng lên nhau thay vì hở góc.
        //
        // Số bậc tỉ lệ với độ cao còn lại của chân: lưới càng mịn thì bậc càng
        // nhiều và càng nhỏ, nên đường chéo mượt dần thay vì mãi thô như khi cố
        // định số bậc.
        // Bậc quá nhỏ thì biên chéo mượt nhưng bộ chia ô buộc phải cắt ra hàng
        // loạt ô vụn dọc theo nét — ô vụn nghĩa là ảnh bé tí trên bản in. Chia
        // cho nửa bề nét là điểm cân bằng giữa độ mượt và kích thước ô.
        int legHeight = h - (midY + s);
        int stepCount = Math.Clamp(legHeight / Math.Max(1, s / 2), 3, 10);
        parts.AddRange(Staircase(
            fromX: (w - s) / 2, fromY: midY + s,
            toX: w - s, toY: h,
            width: s, stepCount: stepCount));
        return parts;
    }

    // Chữ S đối xứng hoàn toàn: xà trên và xà dưới dài bằng nhau và cùng chạy
    // hết bề ngang, xà giữa nằm đúng chính giữa. Phân biệt với số 5 bằng chiều
    // rộng hẹp hơn và bằng việc số 5 có bụng dưới sâu hơn.
    private static List<LatticeRect> LetterS(int w, int h, int s, int midY, int botY) => new()
    {
        new LatticeRect(0, 0, w, s),                        // xà trên
        new LatticeRect(0, 0, s, midY + s),                 // cạnh trái nửa trên
        new LatticeRect(0, midY, w, s),                     // xà giữa, chính giữa
        new LatticeRect(w - s, midY, s, botY - midY + s),   // cạnh phải nửa dưới
        new LatticeRect(0, botY, w, s),                     // xà dưới
    };

    // Số 1: thân đứng ở giữa, cờ chéo bên trái, chân đế đầy.
    private static List<LatticeRect> Digit1(int w, int h, int s, int botY)
    {
        int stemX = (w - s) / 2;
        var parts = new List<LatticeRect>
        {
            new(stemX, 0, s, h),
            new(0, botY, w, s),
        };
        parts.AddRange(Staircase(
            fromX: 0, fromY: s + s / 2,
            toX: stemX, toY: 0,
            width: s, stepCount: 2));
        return parts;
    }

    // Số 5 dùng chung cấu trúc với chữ S nhưng xà giữa nằm CAO hơn, tạo bụng
    // dưới sâu — đúng đặc trưng của chữ số 5 và là thứ tách nó khỏi chữ S khi
    // cả hai đều vẽ dạng khối.
    private static List<LatticeRect> Digit5(int w, int h, int s, int botY)
    {
        int midY = Math.Clamp((int)Math.Round(h * 0.36), s, botY - s);
        return new List<LatticeRect>
        {
            new(0, 0, w, s),                            // xà trên
            new(0, 0, s, midY + s),                     // cạnh trái, ngắn hơn của S
            new(0, midY, w, s),                         // xà giữa, cao hơn
            new(w - s, midY, s, botY - midY + s),       // cạnh phải, dài hơn của S
            new(0, botY, w, s),                         // xà dưới
        };
    }

    /// <summary>
    /// Nét chéo được biểu diễn bằng bậc thang các hình chữ nhật vuông góc, để
    /// mọi ô ảnh vẫn là hình chữ nhật thẳng — điều kiện bắt buộc cho cả bản in
    /// lẫn instancing trên GPU.
    /// </summary>
    private static IEnumerable<LatticeRect> Staircase(
        int fromX, int fromY, int toX, int toY, int width, int stepCount)
    {
        int steps = Math.Max(2, stepCount);
        int dx = toX - fromX;
        int dy = toY - fromY;

        for (int i = 0; i < steps; i++)
        {
            // X nội suy theo (steps-1) để bậc cuối rơi đúng vào toX.
            int x = fromX + (int)Math.Round((double)dx * i / (steps - 1));
            int y0 = fromY + (int)Math.Round((double)dy * i / steps);
            int y1 = fromY + (int)Math.Round((double)dy * (i + 1) / steps);
            int top = Math.Min(y0, y1);
            int span = Math.Max(1, Math.Abs(y1 - y0));
            // Mỗi bậc kéo dài thêm nửa bề nét để hai bậc liền kề chồng lên nhau.
            // Chỉ chồng 1 ô thì đường chéo đọc ra răng cưa rời rạc.
            yield return new LatticeRect(x, top, width, span + Math.Max(1, width / 2));
        }
    }

    /// <summary>Raster 6 chữ cái thành lưới theo bố cục yêu cầu.</summary>
    public static GlyphRaster Rasterize(MosaicOptions o, int unitsPerCap)
    {
        var glyphs = Build(unitsPerCap, ScaleStroke(o, unitsPerCap));
        return o.LayoutMode switch
        {
            MosaicLayoutMode.Stacked => Compose(glyphs, o, unitsPerCap, stacked: true, digitsOnly: false),
            MosaicLayoutMode.DigitsOnly => Compose(glyphs, o, unitsPerCap, stacked: false, digitsOnly: true),
            _ => Compose(glyphs, o, unitsPerCap, stacked: false, digitsOnly: false),
        };
    }

    private static int ScaleStroke(MosaicOptions o, int unitsPerCap)
    {
        // Giữ nguyên tỷ lệ nét/chiều cao khi lưới được nhân đôi.
        double ratio = (double)o.StrokeUnits / Math.Max(1, o.UnitsPerCap);
        return Math.Max(1, (int)Math.Round(unitsPerCap * ratio));
    }

    private static GlyphRaster Compose(
        IReadOnlyList<Glyph> glyphs, MosaicOptions o, int cap, bool stacked, bool digitsOnly)
    {
        double scale = (double)cap / Math.Max(1, o.UnitsPerCap);
        int tracking = Math.Max(1, (int)Math.Round(o.TrackingUnits * scale));
        int wordGap = Math.Max(1, (int)Math.Round(o.WordGapUnits * scale));
        int lineGap = Math.Max(1, (int)Math.Round(o.LineGapUnits * scale));

        var word = glyphs.Take(4).ToList();   // I R I S
        var digits = glyphs.Skip(4).ToList(); // 1 5

        // Vị trí đặt từng chữ: (glyph, chỉ số toàn cục, x, y)
        var placed = new List<(Glyph Glyph, int Index, int X, int Y)>();
        int rows, cols;

        if (digitsOnly)
        {
            int x = 0;
            for (int i = 0; i < digits.Count; i++)
            {
                placed.Add((digits[i], 4 + i, x, 0));
                x += digits[i].Width + (i < digits.Count - 1 ? tracking : 0);
            }
            cols = x;
            rows = cap;
        }
        else if (stacked)
        {
            int wordWidth = word.Sum(g => g.Width) + tracking * (word.Count - 1);
            int digitsWidth = digits.Sum(g => g.Width) + tracking * (digits.Count - 1);
            cols = Math.Max(wordWidth, digitsWidth);
            rows = cap * 2 + lineGap;

            int x = (cols - wordWidth) / 2;
            for (int i = 0; i < word.Count; i++)
            {
                placed.Add((word[i], i, x, 0));
                x += word[i].Width + tracking;
            }

            x = (cols - digitsWidth) / 2;
            for (int i = 0; i < digits.Count; i++)
            {
                placed.Add((digits[i], 4 + i, x, cap + lineGap));
                x += digits[i].Width + tracking;
            }
        }
        else
        {
            int x = 0;
            for (int i = 0; i < word.Count; i++)
            {
                placed.Add((word[i], i, x, 0));
                x += word[i].Width + tracking;
            }
            x += wordGap - tracking;
            for (int i = 0; i < digits.Count; i++)
            {
                placed.Add((digits[i], 4 + i, x, 0));
                x += digits[i].Width + (i < digits.Count - 1 ? tracking : 0);
            }
            cols = x;
            rows = cap;
        }

        var grid = new int[rows * cols];
        Array.Fill(grid, -1);

        foreach (var (glyph, index, ox, oy) in placed)
        {
            foreach (var part in glyph.Parts)
            {
                for (int y = part.Y; y < part.Bottom; y++)
                {
                    int gy = oy + y;
                    if (gy < 0 || gy >= rows) continue;
                    for (int px = part.X; px < part.Right; px++)
                    {
                        int gx = ox + px;
                        if (gx < 0 || gx >= cols) continue;
                        grid[gy * cols + gx] = index;
                    }
                }
            }
        }

        return new GlyphRaster
        {
            Rows = rows,
            Cols = cols,
            LetterIndex = grid,
            Glyphs = glyphs,
        };
    }
}
