using LandingPageEvent.Models.Mosaic;

namespace LandingPageEvent.Services.Mosaic;

/// <summary>Một ô của bố cục: hình chữ nhật trên lưới + chữ cái mà nó thuộc về.</summary>
public readonly record struct PartitionRect(LatticeRect Rect, int LetterIndex);

/// <summary>
/// Chia hình bao của chữ thành đúng N hình chữ nhật không chồng lấn.
///
/// Ý tưởng: chia hạt giống thành ít hình nhất có thể (K đoạn nét chữ), rồi cắt
/// mỗi đoạn thành một lưới r×c. Tổ hợp lưới được chọn bằng quy hoạch động sao
/// cho tổng số ô đúng bằng N và ảnh được nhìn thấy nhiều nhất: ô càng khớp tỷ
/// lệ khung của ảnh thật thì ảnh càng ít bị cắt.
///
/// Bản cũ cứ cắt đôi theo cạnh dài, không biết gì về ảnh — với nét chữ rộng 12
/// ô nó cho ra gần như toàn ô dọc 6×12 trong khi ảnh gửi lên chủ yếu nằm ngang.
/// </summary>
public static class RectPartition
{
    /// <summary>Ảnh có tỷ lệ rộng/cao dưới ngưỡng này được coi là ảnh dọc.</summary>
    public const double PortraitBelow = 0.95;

    /// <summary>Tỷ lệ giả định cho ảnh chưa biết kích thước: giữa 4:3 và 3:2.</summary>
    public const double DefaultAspect = 1.4;

    // shortcut: số ô dọc mà bộ chia chủ động tạo bị chặn ở mức này để thời gian
    // chạy không phình theo số ảnh dọc; nâng lên nếu có hơn ~128 ảnh dọc.
    private const int MaxPortraitTiles = 128;

    public static bool IsPortrait(double aspect) => aspect > 0 && aspect < PortraitBelow;

    /// <summary>
    /// Chia hạt giống: quét hình chữ nhật cực đại trong từng chữ cái, mỗi hạt
    /// giống là trọn một đoạn nét chữ (xà ngang hoặc thân đứng). Không chặn tỷ
    /// lệ khung ở đây — việc đó thuộc về bước cắt lưới, nơi một đoạn nét dài
    /// được chia ĐỀU thay vì cắt theo trần rồi để lại mẩu thừa vài ô.
    /// </summary>
    public static List<PartitionRect> Seed(GlyphRaster raster)
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
                    int row = y + h - 1;
                    int run = RunLength(x, row, letter);
                    if (run == 0) break;

                    // Ngã ba chữ T: xà ngang chạy sang cả hai phía của thân đứng.
                    // Dừng ở đây để xà ngang còn nguyên một dải, không bị thân
                    // cắt làm đôi. Ở góc chữ L (chỉ một phía) thì cứ đi tiếp.
                    bool inkOnLeft = x > 0 && !covered[row * cols + x - 1]
                                     && raster.LetterIndex[row * cols + x - 1] == letter;
                    if (h > 1 && run > narrowest && inkOnLeft) break;

                    narrowest = Math.Min(narrowest, run);
                    if (narrowest * h > bestW * bestH)
                    {
                        bestW = narrowest;
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
    /// Cắt mỗi hạt giống thành một lưới sao cho tổng số ô đúng bằng
    /// <paramref name="target"/>. Trả về danh sách đã sắp xếp tất định theo (y, x).
    /// </summary>
    /// <param name="photoAspects">Tỷ lệ rộng/cao của từng ảnh; ≤ 0 nghĩa là chưa biết.</param>
    /// <remarks>
    /// Trả về danh sách rỗng nếu lưới hiện tại không tạo được đúng số ô đó —
    /// người gọi có trách nhiệm tăng độ phân giải lưới rồi thử lại.
    /// </remarks>
    public static List<PartitionRect> GridToN(
        IReadOnlyList<PartitionRect> seed,
        int target,
        int minSide,
        double maxAspect,
        IReadOnlyList<double> photoAspects)
    {
        var landscape = photoAspects.Where(a => !IsPortrait(a))
            .Select(a => Math.Log(a > 0 ? a : DefaultAspect)).ToArray();
        var portrait = photoAspects.Where(IsPortrait).Select(a => Math.Log(a)).ToArray();
        if (landscape.Length == 0 && portrait.Length == 0) landscape = [Math.Log(DefaultAspect)];

        int pCap = Math.Min(Math.Min(portrait.Length, target), MaxPortraitTiles);
        var options = seed.Select(s => Options(s.Rect, minSide, maxAspect, landscape, portrait)).ToList();

        // best[n, p]: điểm cao nhất khi đã dùng n ô, trong đó p ô dọc.
        int stride = pCap + 1;
        var best = new double[(target + 1) * stride];
        Array.Fill(best, double.NegativeInfinity);
        best[0] = 0;
        var choice = new short[seed.Count][];

        for (int i = 0; i < seed.Count; i++)
        {
            var next = new double[best.Length];
            Array.Fill(next, double.NegativeInfinity);
            var pick = choice[i] = new short[best.Length];

            for (int n = 0; n <= target; n++)
            {
                for (int p = 0; p <= pCap; p++)
                {
                    double current = best[n * stride + p];
                    if (double.IsNegativeInfinity(current)) continue;

                    for (int k = 0; k < options[i].Count; k++)
                    {
                        var o = options[i][k];
                        int n2 = n + o.Count, p2 = p + o.Portraits;
                        if (n2 > target || p2 > pCap) continue;

                        double score = current + o.Score;
                        if (score > next[n2 * stride + p2])
                        {
                            next[n2 * stride + p2] = score;
                            pick[n2 * stride + p2] = (short)k;
                        }
                    }
                }
            }
            best = next;
        }

        // Ảnh dọc không có ô dọc sẽ phải nằm trong ô ngang và bị cắt gần một nửa.
        double orphanPenalty = portrait.Length == 0 || landscape.Length == 0
            ? 0
            : Math.Abs(Median(landscape) - Median(portrait));

        int bestP = -1;
        double bestTotal = double.NegativeInfinity;
        for (int p = 0; p <= pCap; p++)
        {
            double total = best[target * stride + p] - (pCap - p) * orphanPenalty;
            if (total > bestTotal)
            {
                bestTotal = total;
                bestP = p;
            }
        }
        if (bestP < 0) return [];

        var all = new List<PartitionRect>(target);
        for (int i = seed.Count - 1, n = target, p = bestP; i >= 0; i--)
        {
            var o = options[i][choice[i][n * stride + p]];
            foreach (var r in Cells(seed[i].Rect, o.Cols, o.Rows))
                all.Add(new PartitionRect(r, seed[i].LetterIndex));
            n -= o.Count;
            p -= o.Portraits;
        }

        all.Sort(static (l, r) =>
        {
            int c = l.Rect.Y.CompareTo(r.Rect.Y);
            return c != 0 ? c : l.Rect.X.CompareTo(r.Rect.X);
        });
        return all;
    }

    /// <summary>
    /// Dải số ô liên tục [Min, Max] mà bộ chia tạo được. Tích r×c không phủ kín
    /// mọi số nguyên ở sát trần, nên trần dùng được là điểm cuối của dải liên
    /// tục chứ không phải tổng số ô lưới.
    /// </summary>
    public static (int Min, int Max) CountRange(IReadOnlyList<PartitionRect> seed, int minSide, double maxAspect)
    {
        double[] any = [0];
        bool[] reachable = [true];
        foreach (var s in seed)
        {
            var counts = Options(s.Rect, minSide, maxAspect, any, []).Select(o => o.Count).Distinct().ToList();
            var next = new bool[reachable.Length + counts.Max()];
            for (int n = 0; n < reachable.Length; n++)
                if (reachable[n])
                    foreach (int c in counts) next[n + c] = true;
            reachable = next;
        }

        int min = Array.IndexOf(reachable, true);
        int max = min;
        while (max + 1 < reachable.Length && reachable[max + 1]) max++;
        return (min, max);
    }

    private readonly record struct GridOption(int Cols, int Rows, int Count, int Portraits, double Score);

    /// <summary>Mọi cách cắt lưới hợp lệ của một hạt giống, kèm điểm "độ thấy ảnh".</summary>
    private static List<GridOption> Options(
        LatticeRect rect, int minSide, double maxAspect, double[] landscape, double[] portrait)
    {
        var result = new List<GridOption>();
        for (int cols = 1; cols <= Math.Max(1, rect.W / minSide); cols++)
        {
            for (int rows = 1; rows <= Math.Max(1, rect.H / minSide); rows++)
            {
                bool valid = true;
                int portraits = 0;
                double score = 0;

                foreach (var cell in Cells(rect, cols, rows))
                {
                    double aspect = (double)cell.W / cell.H;
                    if (Math.Max(aspect, 1 / aspect) > maxAspect + 1e-9)
                    {
                        valid = false;
                        break;
                    }

                    bool tall = cell.W < cell.H && portrait.Length > 0;
                    if (tall) portraits++;

                    // Điểm của một ô = độ lớn của ảnh trên tường trừ phần ảnh bị
                    // cắt. Vì tổng diện tích cố định, số hạng log tự kéo các ô về
                    // cỡ đều nhau; số hạng còn lại kéo dáng ô về dáng ảnh.
                    double logAspect = Math.Log(aspect);
                    score += 0.5 * Math.Log(cell.Area) - MeanDistance(tall ? portrait : landscape, logAspect);
                }

                if (valid) result.Add(new GridOption(cols, rows, cols * rows, portraits, score));
            }
        }
        // Mẩu quá mảnh không cắt nổi thành ô hợp lệ nào: giữ nguyên làm một ô.
        if (result.Count == 0) result.Add(new GridOption(1, 1, 1, 0, 0));
        return result;
    }

    /// <summary>Các ô của lưới cols×rows trên một hình chữ nhật; bề rộng các ô lệch nhau tối đa 1.</summary>
    private static IEnumerable<LatticeRect> Cells(LatticeRect rect, int cols, int rows)
    {
        for (int r = 0; r < rows; r++)
        {
            int y0 = rect.H * r / rows, y1 = rect.H * (r + 1) / rows;
            for (int c = 0; c < cols; c++)
            {
                int x0 = rect.W * c / cols, x1 = rect.W * (c + 1) / cols;
                yield return new LatticeRect(rect.X + x0, rect.Y + y0, x1 - x0, y1 - y0);
            }
        }
    }

    // |ln(tỷ lệ ô) − ln(tỷ lệ ảnh)| chính là −ln(phần ảnh còn thấy) khi ảnh phủ kín ô.
    private static double MeanDistance(double[] logs, double value)
    {
        double sum = 0;
        foreach (double l in logs) sum += Math.Abs(l - value);
        return sum / logs.Length;
    }

    private static double Median(double[] values)
    {
        var sorted = values.OrderBy(v => v).ToArray();
        return sorted[sorted.Length / 2];
    }
}
