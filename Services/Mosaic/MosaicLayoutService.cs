using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using LandingPageEvent.Configuration;
using LandingPageEvent.Models.Mosaic;
using Microsoft.Extensions.Options;

namespace LandingPageEvent.Services.Mosaic;

public interface IMosaicLayoutService
{
    /// <summary>Dựng bố cục có đúng một ô cho mỗi ảnh (hoặc số ô chỉ định bởi targetTileCount).</summary>
    MosaicLayout Build(
        IReadOnlyList<MosaicPostRef> posts,
        MosaicLayoutMode? modeOverride = null,
        IReadOnlyList<int>? customOrder = null,
        IReadOnlyDictionary<int, int>? customTileAssignments = null,
        int? targetTileCount = null);

    /// <summary>Số ô tối thiểu (và tối đa) mà bố cục hiện tại hỗ trợ.</summary>
    (int Min, int Max) Capacity(MosaicLayoutMode? modeOverride = null);
}

public sealed class MosaicLayoutService(IOptions<MosaicOptions> options) : IMosaicLayoutService
{
    private readonly MosaicOptions _o = options.Value;
    private readonly ConcurrentDictionary<string, MosaicLayout> _cache = new();

    public MosaicLayout Build(
        IReadOnlyList<MosaicPostRef> posts,
        MosaicLayoutMode? modeOverride = null,
        IReadOnlyList<int>? customOrder = null,
        IReadOnlyDictionary<int, int>? customTileAssignments = null,
        int? targetTileCount = null)
    {
        var mode = modeOverride ?? _o.LayoutMode;
        int n = posts.Count;
        int targetTiles = targetTileCount.HasValue && targetTileCount.Value >= 55
            ? targetTileCount.Value
            : n;

        // Nếu có thứ tự tùy chỉnh do Ban Tổ Chức (Admin) sắp xếp, tôn trọng thứ tự đó
        List<MosaicPostRef> ordered;
        if (customOrder != null && customOrder.Count > 0)
        {
            var rankMap = customOrder
                .Select((id, idx) => (id, idx))
                .GroupBy(x => x.id)
                .ToDictionary(g => g.Key, g => g.First().idx);

            ordered = posts
                .OrderBy(p => rankMap.TryGetValue(p.Id, out var idx) ? idx : int.MaxValue)
                .ThenByDescending(p => p.VoteCount)
                .ThenBy(p => p.CreatedAt)
                .ThenBy(p => p.Id)
                .ToList();
        }
        else
        {
            // Mặc định: sắp xếp theo số vote, ngày tạo, Id để layoutId phản ánh đúng thứ tự gán.
            ordered = posts
                .OrderByDescending(p => p.VoteCount)
                .ThenBy(p => p.CreatedAt)
                .ThenBy(p => p.Id)
                .ToList();
        }

        // Chữ ký hình học phải nằm trong layoutId. Nếu chỉ băm các tham số cấu
        // hình thì sửa dáng chữ trong mã nguồn sẽ cho ra đúng layoutId cũ, ETag
        // không đổi, và trình duyệt tiếp tục dùng bố cục cũ mãi mãi.
        var glyphSignature = ComputeGlyphSignature(mode);

        var layoutId = ComputeLayoutId(mode, glyphSignature, ordered, customTileAssignments, targetTileCount);
        if (_cache.TryGetValue(layoutId, out var cached)) return cached;

        var (raster, tiles, unitsPerCap, minTiles) = Partition(mode, targetTiles, posts.Select(p => p.Aspect).ToList());
        var letters = BuildLetters(raster);
        var assigned = Assign(raster, tiles, ordered, posts, customTileAssignments);

        var layout = new MosaicLayout(
            LayoutId: layoutId,
            GlyphVersion: _o.GlyphVersion,
            Mode: mode.ToString(),
            PhotoCount: Math.Min(n, tiles.Count),
            MinTilesForShape: minTiles,
            Lattice: new LatticeInfo(unitsPerCap, raster.Rows, raster.Cols),
            Letters: letters,
            Tiles: assigned);

        // Giới hạn cache để một loạt N khác nhau không giữ bộ nhớ vô hạn.
        if (_cache.Count > 32) _cache.Clear();
        _cache[layoutId] = layout;
        return layout;
    }

    public (int Min, int Max) Capacity(MosaicLayoutMode? modeOverride = null)
    {
        var mode = modeOverride ?? _o.LayoutMode;
        var raster = RasterizeFor(mode, _o.UnitsPerCap);
        return RectPartition.CountRange(RectPartition.Seed(raster), _o.MinTileUnits, _o.MaxTileAspect);
    }

    /// <summary>
    /// Chia hình bao thành đúng n ô, tự tăng độ phân giải lưới nếu n vượt trần
    /// của lưới hiện tại.
    /// </summary>
    private (GlyphRaster Raster, List<PartitionRect> Tiles, int UnitsPerCap, int MinTiles) Partition(
        MosaicLayoutMode mode, int n, IReadOnlyList<double> photoAspects)
    {
        int unitsPerCap = _o.UnitsPerCap;

        for (int escalation = 0; escalation <= _o.MaxLatticeEscalations; escalation++)
        {
            var raster = RasterizeFor(mode, unitsPerCap);
            var seed = RectPartition.Seed(raster);
            var (min, max) = RectPartition.CountRange(seed, _o.MinTileUnits, _o.MaxTileAspect);

            // Dưới ngưỡng min thì hình bao không thể biểu diễn bằng ít hình chữ
            // nhật hơn — tăng độ phân giải cũng không cứu được. Khi đó vẽ đủ
            // hình chữ và để phần dư là ô thương hiệu (PostId = -1), thay vì từ
            // chối dựng bố cục và bỏ trống cả khung 3D lúc đầu sự kiện.
            int target = Math.Max(n, min);

            // Vượt dải liên tục thì coi như lưới này hết sức chứa, kể cả khi một
            // vài giá trị lẻ phía trên vẫn tạo được — để hành vi không nhảy cóc.
            if (target <= max)
            {
                var tiles = RectPartition.GridToN(seed, target, _o.MinTileUnits, _o.MaxTileAspect, photoAspects);
                if (tiles.Count == target) return (raster, tiles, unitsPerCap, min);
            }

            unitsPerCap *= 2; // lưới mịn hơn → trần số ô cao hơn
        }

        throw new InvalidOperationException(
            $"Không dựng được bố cục cho {n} ảnh sau {_o.MaxLatticeEscalations} lần tăng độ phân giải lưới.");
    }

    private GlyphRaster RasterizeFor(MosaicLayoutMode mode, int unitsPerCap)
    {
        var scoped = CloneWithMode(mode);
        return IrisGlyphSet.Rasterize(scoped, unitsPerCap);
    }

    private MosaicOptions CloneWithMode(MosaicLayoutMode mode) => new()
    {
        GlyphVersion = _o.GlyphVersion,
        LayoutMode = mode,
        UnitsPerCap = _o.UnitsPerCap,
        StrokeUnits = _o.StrokeUnits,
        MinTileUnits = _o.MinTileUnits,
        MaxTileAspect = _o.MaxTileAspect,
        TrackingUnits = _o.TrackingUnits,
        WordGapUnits = _o.WordGapUnits,
        LineGapUnits = _o.LineGapUnits,
        MaxLatticeEscalations = _o.MaxLatticeEscalations,
        LetterStratifiedAssignment = _o.LetterStratifiedAssignment,
        PrintPalette = _o.PrintPalette,
    };

    private List<LetterInfo> BuildLetters(GlyphRaster raster)
    {
        var letters = new List<LetterInfo>(raster.Glyphs.Count);
        for (int i = 0; i < raster.Glyphs.Count; i++)
        {
            var g = raster.Glyphs[i];
            bool isDigit = g.Id is "N1" or "N5";
            _o.PrintPalette.TryGetValue(g.Id, out var hex);
            letters.Add(new LetterInfo(
                Id: g.Id,
                Char: g.Char,
                TintRole: isDigit ? TintRoles.Blue : TintRoles.Gold,
                PrintHex: hex ?? (isDigit ? "#1E50C8" : "#D9A03A"),
                Order: i));
        }
        return letters;
    }

    /// <summary>
    /// Gán ảnh vào ô: ô lớn nhận ảnh được yêu thích nhất, nhưng rải đều qua các
    /// chữ cái để top ảnh không dồn hết vào một chữ. Ảnh dọc xếp hàng riêng và
    /// chỉ nhận ô dọc (ảnh ngang nhận ô ngang), để không ảnh nào bị cắt ngang thân.
    /// Nếu có chỉ định vị trí tùy chỉnh (customTileAssignments), ưu tiên gán chính xác theo cấu hình.
    /// </summary>
    private List<MosaicTile> Assign(
        GlyphRaster raster,
        List<PartitionRect> tiles,
        List<MosaicPostRef> orderedPosts,
        IReadOnlyList<MosaicPostRef> allPosts,
        IReadOnlyDictionary<int, int>? customTileAssignments = null)
    {
        // Thứ tự ưu tiên nhận ảnh: ô lớn trước, rồi theo vị trí đọc.
        var byPriority = tiles
            .Select((t, i) => (Tile: t, ReadIndex: i))
            .OrderByDescending(x => x.Tile.Rect.Area)
            .ThenBy(x => x.Tile.Rect.Y)
            .ThenBy(x => x.Tile.Rect.X)
            .ToList();

        if (_o.LetterStratifiedAssignment)
            byPriority = Stratify(byPriority);

        // slot atlas luôn sắp xếp cố định theo Id bài viết để texture cache được tối ưu vĩnh viễn
        var sortedById = allPosts.OrderBy(p => p.Id).ToList();
        var idToAtlasSlot = new Dictionary<int, int>(sortedById.Count);
        for (int s = 0; s < sortedById.Count; s++)
        {
            idToAtlasSlot[sortedById[s].Id] = s;
        }

        var validPostIds = new HashSet<int>(allPosts.Select(p => p.Id));
        var aspectById = allPosts.ToDictionary(p => p.Id, p => p.Aspect);

        // Hai hàng đợi theo dáng ảnh, mỗi hàng vẫn giữ nguyên thứ tự ưu tiên.
        var portraitQueue = new FitQueue(orderedPosts.Where(p => RectPartition.IsPortrait(p.Aspect)));
        var landscapeQueue = new FitQueue(orderedPosts.Where(p => !RectPartition.IsPortrait(p.Aspect)));

        var postIdByReadIndex = new int[tiles.Count];
        var rankByReadIndex = new int[tiles.Count];
        var atlasSlotByReadIndex = new int[tiles.Count];
        Array.Fill(postIdByReadIndex, -1);
        Array.Fill(atlasSlotByReadIndex, -1);

        for (int rank = 0; rank < byPriority.Count; rank++)
        {
            int readIndex = byPriority[rank].ReadIndex;
            rankByReadIndex[readIndex] = rank;

            int pid = -1;
            if (customTileAssignments != null && customTileAssignments.TryGetValue(rank, out int assignedPid) && validPostIds.Contains(assignedPid))
            {
                pid = assignedPid;
            }
            else if (customTileAssignments == null)
            {
                var rect = byPriority[rank].Tile.Rect;
                var (own, other) = rect.W < rect.H ? (portraitQueue, landscapeQueue) : (landscapeQueue, portraitQueue);
                double tileAspect = (double)rect.W / rect.H;
                if (own.Count > 0) pid = own.Take(tileAspect);
                else if (other.Count > 0) pid = other.Take(tileAspect);
            }

            if (pid > 0)
            {
                postIdByReadIndex[readIndex] = pid;
                if (idToAtlasSlot.TryGetValue(pid, out int slot))
                {
                    atlasSlotByReadIndex[readIndex] = slot;
                }
            }
        }

        var result = new List<MosaicTile>(tiles.Count);
        for (int i = 0; i < tiles.Count; i++)
        {
            var t = tiles[i];
            result.Add(new MosaicTile(
                Index: i,
                Unit: t.Rect,
                LetterId: raster.Glyphs[t.LetterIndex].Id,
                PostId: postIdByReadIndex[i],
                Rank: rankByReadIndex[i],
                AtlasSlot: atlasSlotByReadIndex[i],
                PhotoAspect: aspectById.GetValueOrDefault(postIdByReadIndex[i])));
        }
        return result;
    }

    /// <summary>
    /// Hàng đợi ảnh theo thứ tự ưu tiên, nhưng mỗi ô được chọn ảnh vừa khung
    /// nhất trong vài ảnh đứng đầu — ảnh 16:9 nhận ô dẹt, ảnh 4:3 nhận ô gần vuông.
    /// </summary>
    private sealed class FitQueue(IEnumerable<MosaicPostRef> posts)
    {
        // Ảnh chỉ được nhường chỗ trong phạm vi này, nên thứ hạng bình chọn
        // vẫn quyết định cỡ ô; dáng ảnh chỉ tinh chỉnh trong nhóm sát nhau.
        private const int Window = 6;

        private readonly List<MosaicPostRef> _items = posts.ToList();
        private int _headSkips;

        public int Count => _items.Count;

        public int Take(double tileAspect)
        {
            int best = 0;
            if (_headSkips < Window)
            {
                for (int i = 1; i < Math.Min(Window, _items.Count); i++)
                    if (Visible(_items[i].Aspect, tileAspect) > Visible(_items[best].Aspect, tileAspect) + 1e-9)
                        best = i;
            }
            _headSkips = best == 0 ? 0 : _headSkips + 1;

            int id = _items[best].Id;
            _items.RemoveAt(best);
            return id;
        }

        /// <summary>Phần ảnh còn thấy khi ảnh phủ kín ô.</summary>
        private static double Visible(double photoAspect, double tileAspect)
        {
            double p = photoAspect > 0 ? photoAspect : RectPartition.DefaultAspect;
            return Math.Min(p / tileAspect, tileAspect / p);
        }
    }

    /// <summary>Xen kẽ vòng tròn qua từng chữ cái, giữ nguyên thứ tự trong mỗi chữ.</summary>
    private static List<(PartitionRect Tile, int ReadIndex)> Stratify(
        List<(PartitionRect Tile, int ReadIndex)> byPriority)
    {
        var buckets = new SortedDictionary<int, Queue<(PartitionRect, int)>>();
        foreach (var item in byPriority)
        {
            if (!buckets.TryGetValue(item.Tile.LetterIndex, out var q))
                buckets[item.Tile.LetterIndex] = q = new Queue<(PartitionRect, int)>();
            q.Enqueue(item);
        }

        var output = new List<(PartitionRect, int)>(byPriority.Count);
        while (output.Count < byPriority.Count)
        {
            foreach (var q in buckets.Values)
                if (q.Count > 0) output.Add(q.Dequeue());
        }
        return output;
    }

    /// <summary>Băm chính lưới raster của chữ, để mọi thay đổi hình học đều làm đổi ETag.</summary>
    private string ComputeGlyphSignature(MosaicLayoutMode mode)
    {
        var raster = RasterizeFor(mode, _o.UnitsPerCap);

        var bytes = new byte[raster.LetterIndex.Length + 8];
        BitConverter.TryWriteBytes(bytes.AsSpan(0, 4), raster.Rows);
        BitConverter.TryWriteBytes(bytes.AsSpan(4, 4), raster.Cols);
        for (int i = 0; i < raster.LetterIndex.Length; i++)
            bytes[8 + i] = (byte)(raster.LetterIndex[i] + 1); // -1 (nền) → 0

        return Convert.ToHexString(SHA256.HashData(bytes), 0, 8).ToLowerInvariant();
    }

    private string ComputeLayoutId(
        MosaicLayoutMode mode,
        string glyphSignature,
        List<MosaicPostRef> ordered,
        IReadOnlyDictionary<int, int>? customTileAssignments = null,
        int? targetTileCount = null)
    {
        var sb = new StringBuilder();
        sb.Append(_o.GlyphVersion).Append('|')
          .Append(glyphSignature).Append('|')
          .Append(mode).Append('|')
          .Append(targetTileCount ?? 0).Append('|')
          .Append(_o.UnitsPerCap).Append('|')
          .Append(_o.StrokeUnits).Append('|')
          .Append(_o.MinTileUnits).Append('|')
          .Append(_o.MaxTileAspect).Append('|')
          .Append(_o.TrackingUnits).Append('|')
          .Append(_o.WordGapUnits).Append('|')
          .Append(_o.LineGapUnits).Append('|')
          .Append(_o.LetterStratifiedAssignment).Append('|')
          .Append(ordered.Count).Append('|');
        // Tỷ lệ khung ảnh quyết định cả cách chia ô lẫn cách gán, nên phải nằm trong mã băm.
        foreach (var p in ordered) sb.Append(p.Id).Append(':').Append(p.Aspect.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)).Append(',');

        if (customTileAssignments != null && customTileAssignments.Count > 0)
        {
            sb.Append('|');
            foreach (var kvp in customTileAssignments.OrderBy(x => x.Key))
            {
                sb.Append(kvp.Key).Append(':').Append(kvp.Value).Append(';');
            }
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(hash, 0, 12).ToLowerInvariant();
    }
}
