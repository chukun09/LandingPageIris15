using LandingPageEvent.Configuration;
using LandingPageEvent.Models.Mosaic;
using LandingPageEvent.Services.Mosaic;
using Microsoft.Extensions.Options;
using Xunit;

namespace LandingPageEvent.Tests;

/// <summary>
/// Bất biến của bộ sinh bố cục khảm. Đây là những tính chất mà cả khung 3D lẫn
/// file in đều dựa vào, nên chúng phải được khoá lại bằng test.
/// </summary>
public class MosaicLayoutTests
{
    private static MosaicLayoutService NewService(Action<MosaicOptions>? configure = null)
    {
        var options = new MosaicOptions();
        configure?.Invoke(options);
        return new MosaicLayoutService(Options.Create(options));
    }

    private static List<MosaicPostRef> Posts(int n)
    {
        var baseTime = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        return Enumerable.Range(0, n)
            .Select(i => new MosaicPostRef(1000 + i, (i * 7919) % 50, baseTime.AddMinutes(i)))
            .ToList();
    }

    public static TheoryData<int> EveryCountInOperatingRange()
    {
        var data = new TheoryData<int>();
        var (min, max) = NewService().Capacity();
        for (int n = min; n <= max; n++) data.Add(n);
        return data;
    }

    [Theory]
    [MemberData(nameof(EveryCountInOperatingRange))]
    public void Produces_exactly_one_tile_per_photo(int n)
    {
        var layout = NewService().Build(Posts(n));

        Assert.Equal(n, layout.Tiles.Count);
        Assert.Equal(0, layout.EmptyTileCount);
    }

    [Theory]
    [MemberData(nameof(EveryCountInOperatingRange))]
    public void Never_repeats_a_photo(int n)
    {
        var layout = NewService().Build(Posts(n));

        var assigned = layout.Tiles.Select(t => t.PostId).Where(id => id >= 0).ToList();
        Assert.Equal(n, assigned.Count);
        Assert.Equal(n, assigned.Distinct().Count());
    }

    [Theory]
    [InlineData(60)]
    [InlineData(100)]
    [InlineData(130)]
    [InlineData(150)]
    [InlineData(200)]
    public void Tiles_tile_the_shape_without_gaps_or_overlaps(int n)
    {
        var layout = NewService().Build(Posts(n));

        var covered = new HashSet<(int X, int Y)>();
        foreach (var t in layout.Tiles)
            for (int y = t.Unit.Y; y < t.Unit.Bottom; y++)
                for (int x = t.Unit.X; x < t.Unit.Right; x++)
                    Assert.True(covered.Add((x, y)), $"Ô lưới ({x},{y}) bị hai ô ảnh phủ chồng lên nhau.");

        // Tổng diện tích các ô phải khớp đúng số ô lưới đã phủ → không hở, không chồng.
        Assert.Equal(layout.Tiles.Sum(t => t.Unit.Area), covered.Count);
    }

    [Theory]
    [InlineData(60)]
    [InlineData(130)]
    [InlineData(250)]
    public void Tile_aspect_never_exceeds_the_configured_cap(int n)
    {
        var options = new MosaicOptions();
        var layout = NewService().Build(Posts(n));

        foreach (var t in layout.Tiles)
        {
            double aspect = (double)Math.Max(t.Unit.W, t.Unit.H) / Math.Min(t.Unit.W, t.Unit.H);
            Assert.True(
                aspect <= options.MaxTileAspect + 1e-9,
                $"Ô {t.Index} có tỷ lệ khung {aspect:F2}, vượt trần {options.MaxTileAspect}.");
        }
    }

    [Theory]
    [InlineData(100)]
    [InlineData(130)]
    [InlineData(150)]
    public void Same_input_yields_byte_identical_layout(int n)
    {
        // Ba instance độc lập, không dùng chung cache.
        var a = Fingerprint(NewService().Build(Posts(n)));
        var b = Fingerprint(NewService().Build(Posts(n)));
        var c = Fingerprint(NewService().Build(Posts(n)));

        Assert.Equal(a, b);
        Assert.Equal(b, c);
    }

    public static TheoryData<int> CountsAboveBaseCapacity()
    {
        // Suy ra từ sức chứa thật, không hardcode: trần lưới gốc thay đổi theo
        // UnitsPerCap/StrokeUnits nên số cứng sẽ mục ngay khi chỉnh hình chữ.
        var (_, max) = NewService().Capacity();
        return new TheoryData<int> { max + 1, max + 50, max * 3 };
    }

    [Theory]
    [MemberData(nameof(CountsAboveBaseCapacity))]
    public void Escalates_lattice_resolution_when_photo_count_exceeds_base_capacity(int n)
    {
        var service = NewService();
        var (_, maxAtBase) = service.Capacity();
        Assert.True(n > maxAtBase, "Test này chỉ có nghĩa khi n vượt trần lưới gốc.");

        var layout = service.Build(Posts(n));

        Assert.Equal(n, layout.Tiles.Count);
        Assert.True(
            layout.Lattice.UnitsPerCap > new MosaicOptions().UnitsPerCap,
            "Lưới lẽ ra phải được tăng độ phân giải.");
    }

    public static TheoryData<int> CountsBelowGeometricFloor()
    {
        var (min, _) = NewService().Capacity();
        return new TheoryData<int> { 1, 10, min - 1 };
    }

    [Theory]
    [MemberData(nameof(CountsBelowGeometricFloor))]
    public void Below_the_geometric_floor_it_still_draws_the_wordmark(int n)
    {
        var service = NewService();
        var (min, _) = service.Capacity();
        Assert.True(n < min, "Test này chỉ có nghĩa khi n dưới ngưỡng hình học.");

        var layout = service.Build(Posts(n));

        // Vẫn vẽ đủ hình chữ; phần dư là ô thương hiệu chứ không phải ảnh lặp lại.
        Assert.Equal(min, layout.Tiles.Count);
        Assert.Equal(n, layout.Tiles.Count(t => t.PostId >= 0));
        Assert.Equal(min - n, layout.EmptyTileCount);
    }

    /// <summary>
    /// Bất biến quan trọng nhất của cả hệ thống: <b>hình chữ không đổi theo số ảnh</b>.
    ///
    /// Số ảnh chỉ quyết định hình bao được CẮT thành bao nhiêu mảnh, không quyết
    /// định hình bao là gì. Nhờ vậy 60 ảnh hay 300 ảnh vẫn ra đúng chữ "IRIS 15",
    /// chỉ khác độ mịn của các ô — không bao giờ có chuyện thêm ảnh làm méo chữ.
    /// </summary>
    [Fact]
    public void Wordmark_silhouette_is_identical_at_every_photo_count()
    {
        var service = NewService();
        var (min, max) = service.Capacity();

        static HashSet<(int X, int Y)> Silhouette(MosaicLayout layout)
        {
            var cells = new HashSet<(int, int)>();
            foreach (var t in layout.Tiles)
                for (int y = t.Unit.Y; y < t.Unit.Bottom; y++)
                    for (int x = t.Unit.X; x < t.Unit.Right; x++)
                        cells.Add((x, y));
            return cells;
        }

        var reference = Silhouette(service.Build(Posts(min)));

        foreach (int n in new[] { min, min + 1, 80, 120, 150, 200, max })
        {
            if (n < min || n > max) continue;
            var layout = service.Build(Posts(n));

            Assert.Equal(n, layout.Tiles.Count);
            Assert.True(
                reference.SetEquals(Silhouette(layout)),
                $"Hình chữ ở N={n} khác với hình chữ gốc — số ảnh không được phép làm đổi dáng chữ.");
        }
    }

    /// <summary>Ngay cả khi lưới bị tăng độ phân giải, hình chữ vẫn phải là hình chữ đó.</summary>
    [Fact]
    public void Wordmark_shape_survives_lattice_escalation()
    {
        var service = NewService();
        var (_, max) = service.Capacity();

        var baseLayout = service.Build(Posts(max));
        var escalated = service.Build(Posts(max * 2));

        Assert.True(escalated.Lattice.UnitsPerCap > baseLayout.Lattice.UnitsPerCap);

        // Lưới mịn gấp đôi thì mọi kích thước cũng phải gấp đôi — cùng một hình,
        // chỉ khác đơn vị đo.
        double scale = (double)escalated.Lattice.UnitsPerCap / baseLayout.Lattice.UnitsPerCap;
        Assert.Equal(baseLayout.Lattice.Rows * scale, escalated.Lattice.Rows, 0);
        Assert.Equal(
            (double)baseLayout.Lattice.Cols / baseLayout.Lattice.Rows,
            (double)escalated.Lattice.Cols / escalated.Lattice.Rows,
            1);
    }

    [Fact]
    public void Top_photos_are_spread_one_per_letter()
    {
        var layout = NewService().Build(Posts(150));

        var topSix = layout.Tiles
            .Where(t => t.Rank < 6)
            .OrderBy(t => t.Rank)
            .Select(t => t.LetterId)
            .ToList();

        Assert.Equal(6, topSix.Count);
        Assert.Equal(6, topSix.Distinct().Count());
    }

    [Fact]
    public void Every_tile_belongs_to_a_declared_letter()
    {
        var layout = NewService().Build(Posts(150));
        var declared = layout.Letters.Select(l => l.Id).ToHashSet();

        Assert.All(layout.Tiles, t => Assert.Contains(t.LetterId, declared));
    }

    [Fact]
    public void Letters_are_gold_and_digits_are_blue_like_the_logo()
    {
        var layout = NewService().Build(Posts(150));

        // Logo IRIS 15: bốn chữ IRIS vàng kim, hai chữ số 15 xanh dương.
        Assert.Equal(
            new[] { TintRoles.Gold, TintRoles.Gold, TintRoles.Gold, TintRoles.Gold, TintRoles.Blue, TintRoles.Blue },
            layout.Letters.OrderBy(l => l.Order).Select(l => l.TintRole).ToArray());
    }

    [Fact]
    public void Layout_id_changes_when_the_glyph_geometry_changes()
    {
        // Bề rộng nét là một phần của hình học chữ; nếu layoutId không đổi theo
        // nó thì ETag đứng yên và trình duyệt giữ mãi bố cục cũ.
        var a = NewService(o => o.StrokeUnits = 6).Build(Posts(150)).LayoutId;
        var b = NewService(o => o.StrokeUnits = 5).Build(Posts(150)).LayoutId;

        Assert.NotEqual(a, b);
    }

    [Theory]
    [InlineData(MosaicLayoutMode.Inline)]
    [InlineData(MosaicLayoutMode.Stacked)]
    [InlineData(MosaicLayoutMode.DigitsOnly)]
    public void All_layout_modes_produce_exactly_n_tiles(MosaicLayoutMode mode)
    {
        var service = NewService(o => o.LayoutMode = mode);
        var (min, max) = service.Capacity();
        int n = Math.Clamp(150, min, max);

        var layout = service.Build(Posts(n));

        Assert.Equal(n, layout.Tiles.Count);
        Assert.Equal(mode.ToString(), layout.Mode);
    }

    [Fact]
    public void Layout_id_changes_when_the_photo_set_changes()
    {
        var service = NewService();

        var a = service.Build(Posts(150)).LayoutId;
        var b = service.Build(Posts(151)).LayoutId;

        Assert.NotEqual(a, b);
    }

    private static string Fingerprint(MosaicLayout layout) =>
        string.Join(';', layout.Tiles.Select(t =>
            $"{t.Index}:{t.Unit.X},{t.Unit.Y},{t.Unit.W},{t.Unit.H},{t.LetterId},{t.PostId},{t.Rank}"));
}
