using LandingPageEvent.Models.Mosaic;

namespace LandingPageEvent.Services.Mosaic;

/// <summary>Một ô của bố cục: hình chữ nhật trên lưới + chữ cái mà nó thuộc về.</summary>
public readonly record struct PartitionRect(LatticeRect Rect, int LetterIndex);

/// <summary>
/// Chia hình bao của chữ thành đúng N hình chữ nhật không chồng lấn.
///
/// Ý tưởng: chia hạt giống thành ít hình nhất có thể (K hình), rồi <b>tách</b>
/// dần cho tới khi đủ N. Mỗi lần tách làm số hình tăng đúng 1, nên mọi giá trị
/// nguyên N trong [K, M] đều đạt được — trong đó M là số ô lưới đơn vị.
/// Gộp ô (2×2, 3×3…) không có tính chất này: nó luôn để lại phần dư không gộp
/// được và không đảm bảo chạm đúng N.
/// </summary>
public static class RectPartition
{
    /// <summary>
    /// Chia hạt giống: quét hình chữ nhật cực đại trong từng chữ cái, có chặn
    /// tỷ lệ khung để không sinh ra ô dài ngoằng không đặt được ảnh.
    /// </summary>
    public static List<PartitionRect> Seed(GlyphRaster raster, double maxAspect)
    {
        int rows = raster.Rows, cols = raster.Cols;
        var covered = new bool[rows * cols];
        var result = new List<PartitionRect>();

        int RunLength(int x, int y, int letter)
        {
            int n = 0;
            while (x + n < cols)
            {
                int i = y * cols + (x + n);
                if (covered[i] || raster.LetterIndex[i] != letter) break;
                n++;
            }
            return n;
        }

        for (int y = 0; y < rows; y++)
        {
            for (int x = 0; x < cols; x++)
            {
                int idx = y * cols + x;
                if (covered[idx]) continue;
                int letter = raster.LetterIndex[idx];
                if (letter < 0) continue;

                int bestW = 1, bestH = 1;
                int narrowest = int.MaxValue;

                for (int h = 1; y + h <= rows; h++)
                {
                    int run = RunLength(x, y + h - 1, letter);
                    if (run == 0) break;
                    narrowest = Math.Min(narrowest, run);

                    // Với chiều cao h, bề rộng w phải thoả w <= h*A và h <= w*A.
                    int wMax = Math.Min(narrowest, (int)Math.Floor(h * maxAspect));
                    int wMin = (int)Math.Ceiling(h / maxAspect);
                    if (wMax < wMin)
                    {
                        // Không còn bề rộng hợp lệ và cũng không thể rộng thêm.
                        if (wMin > narrowest) break;
                        continue;
                    }

                    if (wMax * h > bestW * bestH)
                    {
                        bestW = wMax;
                        bestH = h;
                    }
                }

                for (int yy = y; yy < y + bestH; yy++)
                    for (int xx = x; xx < x + bestW; xx++)
                        covered[yy * cols + xx] = true;

                result.Add(new PartitionRect(new LatticeRect(x, y, bestW, bestH), letter));
            }
        }

        return result;
    }

    /// <summary>
    /// Tách bố cục hạt giống cho tới khi có đúng <paramref name="target"/> ô.
    /// Trả về danh sách đã sắp xếp tất định theo (y, x).
    /// </summary>
    /// <remarks>
    /// Nếu không thể đạt tới <paramref name="target"/> (mọi ô đều đã ở kích thước
    /// nhỏ nhất), hàm trả về số ô tối đa đạt được — người gọi có trách nhiệm
    /// tăng độ phân giải lưới rồi thử lại.
    /// </remarks>
    public static List<PartitionRect> SplitToN(
        IReadOnlyList<PartitionRect> seed, int target, int minSide, double maxAspect)
    {
        var comparer = new SplitPriorityComparer();
        var queue = new PriorityQueue<PartitionRect, SplitKey>(comparer);
        var frozen = new List<PartitionRect>();

        int seq = 0;
        void Push(PartitionRect r) => queue.Enqueue(r, SplitKey.For(r.Rect, maxAspect, seq++));

        foreach (var r in seed) Push(r);
        int count = seed.Count;

        while (count < target && queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (TrySplit(current, minSide, out var a, out var b))
            {
                Push(a);
                Push(b);
                count++; // tách một hình thành hai → tăng đúng 1
            }
            else
            {
                frozen.Add(current); // đã ở kích thước nhỏ nhất, không tách được nữa
            }
        }

        var all = new List<PartitionRect>(count);
        foreach (var (element, _) in queue.UnorderedItems) all.Add(element);
        all.AddRange(frozen);

        all.Sort(static (l, r) =>
        {
            int c = l.Rect.Y.CompareTo(r.Rect.Y);
            if (c != 0) return c;
            return l.Rect.X.CompareTo(r.Rect.X);
        });
        return all;
    }

    private static bool TrySplit(PartitionRect src, int minSide, out PartitionRect a, out PartitionRect b)
    {
        var r = src.Rect;
        bool canVertical = r.W >= 2 * minSide;
        bool canHorizontal = r.H >= 2 * minSide;

        if (!canVertical && !canHorizontal)
        {
            a = default;
            b = default;
            return false;
        }

        // Ưu tiên cắt theo cạnh dài để tỷ lệ khung tự cải thiện qua mỗi lần tách.
        bool vertical = canVertical && (!canHorizontal || r.W >= r.H);

        if (vertical)
        {
            int left = r.W / 2;
            a = new PartitionRect(new LatticeRect(r.X, r.Y, left, r.H), src.LetterIndex);
            b = new PartitionRect(new LatticeRect(r.X + left, r.Y, r.W - left, r.H), src.LetterIndex);
        }
        else
        {
            int top = r.H / 2;
            a = new PartitionRect(new LatticeRect(r.X, r.Y, r.W, top), src.LetterIndex);
            b = new PartitionRect(new LatticeRect(r.X, r.Y + top, r.W, r.H - top), src.LetterIndex);
        }

        return true;
    }

    /// <summary>
    /// Khoá ưu tiên tách. Thứ tự toàn phần nên kết quả hoàn toàn tất định:
    /// sửa ô lệch tỷ lệ trước, rồi luôn tách ô lớn nhất, rồi theo vị trí.
    /// </summary>
    private readonly record struct SplitKey(
        int SliverFirst, double NegAspect, int NegArea, int Y, int X, int Seq)
    {
        public static SplitKey For(LatticeRect r, double maxAspect, int seq)
        {
            double aspect = (double)Math.Max(r.W, r.H) / Math.Max(1, Math.Min(r.W, r.H));
            bool sliver = aspect > maxAspect;
            return new SplitKey(
                sliver ? 0 : 1,
                sliver ? -aspect : 0,
                -r.Area,
                r.Y,
                r.X,
                seq);
        }
    }

    private sealed class SplitPriorityComparer : IComparer<SplitKey>
    {
        public int Compare(SplitKey l, SplitKey r)
        {
            int c = l.SliverFirst.CompareTo(r.SliverFirst);
            if (c != 0) return c;
            c = l.NegAspect.CompareTo(r.NegAspect);
            if (c != 0) return c;
            c = l.NegArea.CompareTo(r.NegArea);
            if (c != 0) return c;
            c = l.Y.CompareTo(r.Y);
            if (c != 0) return c;
            c = l.X.CompareTo(r.X);
            if (c != 0) return c;
            return l.Seq.CompareTo(r.Seq);
        }
    }
}
