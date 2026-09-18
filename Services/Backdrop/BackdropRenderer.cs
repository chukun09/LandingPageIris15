using System.Numerics;
using LandingPageEvent.Configuration;
using LandingPageEvent.Models.Backdrop;
using LandingPageEvent.Models.Mosaic;
using LandingPageEvent.Services.Mosaic;
using Microsoft.Extensions.Options;
using QRCoder;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Tiff;
using SixLabors.ImageSharp.Formats.Tiff.Constants;
using SixLabors.ImageSharp.Memory;
using SixLabors.ImageSharp.Metadata;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

using ImageSharpConfiguration = SixLabors.ImageSharp.Configuration;

namespace LandingPageEvent.Services.Backdrop;

public interface IBackdropRenderer
{
    Task RenderAsync(BackdropJob job, IProgress<(double Progress, string Stage)> progress, CancellationToken ct);
    Task<BackdropPreflight> PreflightAsync(BackdropSpec spec, CancellationToken ct);
}

public sealed record BackdropPreflight(
    int PhotoCount,
    int MinPhotos,
    int CanvasWidthPx,
    int CanvasHeightPx,
    long Megapixels,
    long EstimatedPeakBytes,
    int MetadataDpi,
    int LargestTileEdgePx,
    bool ExceedsMemoryCap,
    IReadOnlyList<BackdropWarning> LowResolutionPhotos);

/// <summary>
/// Dựng file in backdrop từ CÙNG bố cục mà khung 3D trên web đang hiển thị.
///
/// Bản cũ nhân mặt nạ chữ lên 2×2 thành 920 ô rồi đổ ~84% ô bằng gradient sinh
/// ngẫu nhiên, và nạp toàn bộ vào một MemoryStream đang lớn dần. Ở đây mỗi ảnh
/// chiếm đúng một ô, và ảnh được ghi thẳng ra đĩa.
/// </summary>
public sealed class BackdropRenderer(
    IOptions<BackdropOptions> options,
    IMosaicLayoutService layoutService,
    IMosaicSourceCache sourceCache,
    IPostService postService,
    IWebHostEnvironment environment,
    ILogger<BackdropRenderer> logger) : IBackdropRenderer
{
    private readonly BackdropOptions _o = options.Value;

    private string WebRoot => environment.WebRootPath
                              ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

    private string CacheDir => Path.Combine(WebRoot, _o.CacheDirectory.Replace('/', Path.DirectorySeparatorChar));

    // ── Cấu hình ImageSharp riêng cho việc dựng ảnh lớn ─────────────────────
    // Không đụng Configuration.Default: nó cũng phục vụ việc tạo thumbnail lúc
    // upload, và bóp nghẹt nó sẽ làm chậm cả luồng người dùng.
    private ImageSharpConfiguration BuildConfiguration()
    {
        var cfg = ImageSharpConfiguration.Default.Clone();
        cfg.MemoryAllocator = MemoryAllocator.Create(new MemoryAllocatorOptions
        {
            // Không đặt trần pool thì bộ cấp phát GIỮ LẠI mọi khối đã dùng, và
            // working set phình lên gấp ba kích thước khung ảnh. Đặt trần buộc
            // phần vượt phải cấp phát thường và trả về cho GC ngay.
            MaximumPoolSizeMegabytes = _o.PoolSizeLimitMb,
            AllocationLimitMegabytes = _o.AllocationLimitMb,
        });
        cfg.MaxDegreeOfParallelism = Math.Max(1, _o.MaxDegreeOfParallelism);
        // Để false: khung ảnh được cấp phát thành nhiều khối gộp thay vì một mảng
        // liền trên Large Object Heap — thứ thực sự sống sót trên heap chạy dài.
        cfg.PreferContiguousImageBuffers = false;
        return cfg;
    }

    public async Task<BackdropPreflight> PreflightAsync(BackdropSpec spec, CancellationToken ct)
    {
        var posts = await postService.GetMosaicPostRefsAsync(ct);
        var layout = layoutService.Build(posts);
        var (minPhotos, _) = layoutService.Capacity();

        var originals = await postService.GetOriginalPathsAsync(ct);
        var infos = await sourceCache.IdentifyAsync(originals, ct);

        var plan = PlaceTiles(layout, spec);
        var warnings = new List<BackdropWarning>();
        int largestEdge = 0;

        foreach (var p in plan)
        {
            int edge = Math.Max(p.Rect.Width, p.Rect.Height);
            if (edge > largestEdge) largestEdge = edge;
            if (p.PostId < 0) continue;
            if (!infos.TryGetValue(p.PostId, out var info)) continue;
            if (info.ShortEdge < edge)
                warnings.Add(new BackdropWarning(p.PostId, info.ShortEdge, edge, p.TileIndex));
        }

        // Hệ số 9 byte/điểm ảnh là số ĐO THỰC, không phải suy từ lý thuyết:
        // khung ảnh Rgb24 chỉ tốn 3 byte/điểm, nhưng vùng đệm của bộ mã hoá,
        // bước thu nhỏ tạo ảnh xem trước và phần heap chưa được thu gom đẩy
        // working set đỉnh lên khoảng gấp ba. Đo tại 103 Mpx: 934 MB.
        long peak = (long)spec.CanvasWidthPx * spec.CanvasHeightPx * 9
                    + (long)_o.SourceCacheEdgePx * _o.SourceCacheEdgePx * 3 * 2;

        return new BackdropPreflight(
            PhotoCount: layout.PhotoCount,
            MinPhotos: minPhotos,
            CanvasWidthPx: spec.CanvasWidthPx,
            CanvasHeightPx: spec.CanvasHeightPx,
            Megapixels: spec.Megapixels,
            EstimatedPeakBytes: peak,
            MetadataDpi: spec.MetadataDpi,
            LargestTileEdgePx: largestEdge,
            ExceedsMemoryCap: spec.Megapixels > _o.MaxOutputMegapixels,
            LowResolutionPhotos: warnings.OrderByDescending(w => w.RequiredPx - w.SourceShortEdgePx).ToList());
    }

    public async Task RenderAsync(
        BackdropJob job, IProgress<(double, string)> progress, CancellationToken ct)
    {
        var spec = job.Spec;
        if (spec.Megapixels > _o.MaxOutputMegapixels)
        {
            throw new InvalidOperationException(
                $"Khổ yêu cầu là {spec.Megapixels} triệu điểm ảnh, vượt trần {_o.MaxOutputMegapixels}. " +
                $"Hạ DPI hoặc hạ kích thước, hoặc nâng Backdrop:MaxOutputMegapixels nếu máy chủ đủ RAM.");
        }

        progress.Report((0.02, "Đang lấy bố cục"));
        var posts = await postService.GetMosaicPostRefsAsync(ct);
        var layout = layoutService.Build(posts);
        var originals = await postService.GetOriginalPathsAsync(ct);
        var infos = await sourceCache.IdentifyAsync(originals, ct);

        var plan = PlaceTiles(layout, spec);
        var letterColors = layout.Letters.ToDictionary(l => l.Id, l => ParseColor(l.PrintHex));

        Directory.CreateDirectory(CacheDir);
        var cfg = BuildConfiguration();

        progress.Report((0.05, "Đang cấp phát khung ảnh"));
        using var canvas = new Image<Rgb24>(cfg, spec.CanvasWidthPx, spec.CanvasHeightPx);

        var background = BackgroundFor(spec.Theme);
        FillSolid(canvas, background);

        // ── Ghép từng ô ảnh ────────────────────────────────────────────────
        int done = 0;
        foreach (var placement in plan)
        {
            ct.ThrowIfCancellationRequested();

            var tint = letterColors.TryGetValue(placement.LetterId, out var c) ? c : background;
            await DrawTileAsync(canvas, cfg, placement, tint, spec.Theme, originals, infos, job, ct);

            done++;
            if (done % 5 == 0 || done == plan.Count)
                progress.Report((0.05 + 0.75 * done / plan.Count, $"Đang ghép ảnh {done}/{plan.Count}"));
        }

        // ── Khối thương hiệu ───────────────────────────────────────────────
        progress.Report((0.82, "Đang ghép logo và mã QR"));
        await DrawLogoAsync(canvas, cfg, spec, ct);
        DrawQrCode(canvas, cfg, spec);

        // ── Ghi ra đĩa ─────────────────────────────────────────────────────
        progress.Report((0.88, "Đang ghi file in"));
        ApplyMetadata(canvas.Metadata, spec);

        var fileName = spec.FileName(layout.LayoutId, layout.PhotoCount);
        var filePath = Path.Combine(CacheDir, fileName);
        await using (var stream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await canvas.SaveAsync(stream, EncoderFor(spec), ct);
        }
        job.FilePath = filePath;
        job.FileBytes = new FileInfo(filePath).Length;

        // ── Ảnh xem trước cho web ──────────────────────────────────────────
        // Thu nhỏ TẠI CHỖ chứ không Clone: Clone nhân đôi cả khung ảnh lớn trước
        // khi thu nhỏ, đẩy bộ nhớ đỉnh lên gấp ba. Sau khi file master đã nằm
        // trên đĩa thì không cần giữ nguyên khung ảnh nữa.
        progress.Report((0.95, "Đang tạo ảnh xem trước"));
        var previewPath = Path.Combine(CacheDir, Path.GetFileNameWithoutExtension(fileName) + "_preview.jpg");
        canvas.Mutate(x => x.Resize(new ResizeOptions
        {
            Size = new Size(_o.PreviewMaxEdgePx, _o.PreviewMaxEdgePx),
            Mode = ResizeMode.Max,
            Sampler = KnownResamplers.Lanczos3,
        }));
        await using (var stream = new FileStream(previewPath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await canvas.SaveAsync(stream, new JpegEncoder { Quality = _o.PreviewJpegQuality }, ct);
        }
        job.PreviewPath = previewPath;

        cfg.MemoryAllocator.ReleaseRetainedResources();
        progress.Report((1.0, "Hoàn tất"));
        logger.LogInformation(
            "Đã dựng backdrop {File} ({Width}×{Height}px, {Bytes:N0} byte, {Warnings} cảnh báo)",
            fileName, spec.CanvasWidthPx, spec.CanvasHeightPx, job.FileBytes, job.Warnings.Count);
    }

    // ── Vị trí từng ô trên tấm backdrop ────────────────────────────────────
    private sealed record TilePlacement(int TileIndex, Rectangle Rect, int PostId, string LetterId);

    private List<TilePlacement> PlaceTiles(MosaicLayout layout, BackdropSpec spec)
    {
        int bleed = spec.MmToPx(spec.BleedMm);
        int safe = spec.MmToPx(spec.SafeMarginMm);

        int safeX = bleed + safe;
        int safeY = bleed + safe;
        int safeW = spec.MmToPx(spec.TrimWidthMm) - safe * 2;
        int safeH = spec.MmToPx(spec.TrimHeightMm) - safe * 2;

        double bandW = safeW * Math.Clamp(_o.MosaicWidthFraction, 0.1, 1.0);
        double unit = bandW / layout.Lattice.Cols;
        double bandH = unit * layout.Lattice.Rows;

        // Nếu dải chữ cao quá vùng an toàn thì thu theo chiều cao thay vì bề rộng.
        if (bandH > safeH)
        {
            unit = (double)safeH / layout.Lattice.Rows;
            bandW = unit * layout.Lattice.Cols;
            bandH = safeH;
        }

        double originX = safeX + (safeW - bandW) / 2;
        double originY = safeY + safeH * Math.Clamp(_o.MosaicCenterYFraction, 0.1, 0.9) - bandH / 2;
        originY = Math.Clamp(originY, safeY, safeY + safeH - bandH);

        var result = new List<TilePlacement>(layout.Tiles.Count);
        foreach (var t in layout.Tiles)
        {
            // Quy đổi bằng mép trái/phải rồi trừ, thay vì nhân bề rộng — cách này
            // không để lại đường hở giữa hai ô cạnh nhau do làm tròn.
            int x0 = (int)Math.Round(originX + t.Unit.X * unit);
            int x1 = (int)Math.Round(originX + t.Unit.Right * unit);
            int y0 = (int)Math.Round(originY + t.Unit.Y * unit);
            int y1 = (int)Math.Round(originY + t.Unit.Bottom * unit);

            var rect = new Rectangle(x0, y0, Math.Max(1, x1 - x0), Math.Max(1, y1 - y0));
            result.Add(new TilePlacement(t.Index, rect, t.PostId, t.LetterId));
        }
        return result;
    }

    // ── Vẽ một ô ───────────────────────────────────────────────────────────
    private async Task DrawTileAsync(
        Image<Rgb24> canvas,
        ImageSharpConfiguration cfg,
        TilePlacement placement,
        Vector3 tint,
        BackdropTheme theme,
        IReadOnlyDictionary<int, string> originals,
        IReadOnlyDictionary<int, SourceImageInfo> infos,
        BackdropJob job,
        CancellationToken ct)
    {
        var rect = placement.Rect;

        // Ô chưa có ảnh: tô khối màu thương hiệu, không phải gradient ngẫu nhiên.
        if (placement.PostId < 0 || !originals.TryGetValue(placement.PostId, out var relative))
        {
            using var plate = new Image<Rgb24>(cfg, rect.Width, rect.Height);
            FillSolid(plate, EmptyPlateColor(tint, theme));
            DrawBorder(plate, tint, theme);
            canvas.Mutate(x => x.DrawImage(plate, rect.Location, 1f));
            return;
        }

        var cached = await sourceCache.GetOrCreateAsync(placement.PostId, relative, ct);
        if (cached is null) return;

        if (infos.TryGetValue(placement.PostId, out var info))
        {
            int needed = Math.Max(rect.Width, rect.Height);
            if (info.ShortEdge < needed)
                job.Warnings.Add(new BackdropWarning(placement.PostId, info.ShortEdge, needed, placement.TileIndex));
        }

        try
        {
            using var tile = await Image.LoadAsync<Rgb24>(cfg, cached, ct);
            tile.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(rect.Width, rect.Height),
                Mode = ResizeMode.Crop,
                Sampler = KnownResamplers.Lanczos3,
            }));

            if (_o.Tint != TintMode.Off) ApplyToneAndTint(tile, tint);
            if (_o.TileBorderEnabled) DrawBorder(tile, tint, theme);

            canvas.Mutate(x => x.DrawImage(tile, rect.Location, 1f));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Bỏ qua ảnh lỗi ở ô {Tile}: {Message}", placement.TileIndex, ex.Message);
        }
    }

    /// <summary>
    /// Chuẩn hoá độ sáng rồi giảm bão hoà và nhuộm màu chữ — gộp cả ba vào MỘT
    /// ma trận màu, chạy một lượt SIMD, không cấp phát thêm.
    ///
    /// Đây là thứ làm chữ đọc được từ xa: ảnh ngẫu nhiên có độ sáng ngẫu nhiên,
    /// và chính phương sai độ sáng mới làm tan biên chữ chứ không phải màu sắc.
    /// </summary>
    private void ApplyToneAndTint(Image<Rgb24> tile, Vector3 tint)
    {
        double gain = 1.0;

        // Đo độ sáng trung bình trên bản thu nhỏ 8×8 — vài chục micro giây.
        using (var probe = tile.Clone(x => x.Resize(8, 8, KnownResamplers.Box)))
        {
            double sum = 0;
            probe.ProcessPixelRows(accessor =>
            {
                for (int y = 0; y < accessor.Height; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (int x = 0; x < row.Length; x++)
                        sum += (0.2126 * row[x].R + 0.7152 * row[x].G + 0.0722 * row[x].B) / 255.0;
                }
            });
            double mean = sum / 64.0;
            if (mean > 0.001)
                gain = Math.Clamp(_o.TargetLuma / mean, _o.LumaGainMin, _o.LumaGainMax);
        }

        float strength = (float)(_o.Tint == TintMode.Strong ? _o.TintStrength * 1.6 : _o.TintStrength);
        strength = Math.Clamp(strength, 0f, 0.85f);
        float k = (float)Math.Clamp(_o.TintSaturation, 0.0, 1.0);
        float g = (float)gain * (1f - strength);

        // Ma trận bão hoà theo trọng số Rec.709, đã nhân sẵn gain và phần bù nhuộm.
        const float lr = 0.2126f, lg = 0.7152f, lb = 0.0722f;
        var m = new ColorMatrix
        {
            M11 = (lr * (1 - k) + k) * g, M12 = (lr * (1 - k)) * g,     M13 = (lr * (1 - k)) * g,
            M21 = (lg * (1 - k)) * g,     M22 = (lg * (1 - k) + k) * g, M23 = (lg * (1 - k)) * g,
            M31 = (lb * (1 - k)) * g,     M32 = (lb * (1 - k)) * g,     M33 = (lb * (1 - k) + k) * g,
            M44 = 1f,
            M51 = tint.X * strength,
            M52 = tint.Y * strength,
            M53 = tint.Z * strength,
        };

        tile.Mutate(x => x.Filter(m));
    }

    /// <summary>
    /// Viền trong mỗi ô, màu chữ pha trắng. Đây là thứ làm bức khảm "ăn" ở xa:
    /// nó định nghĩa biên hình mà nội dung ảnh vốn làm nhoè.
    /// </summary>
    private void DrawBorder(Image<Rgb24> tile, Vector3 tint, BackdropTheme theme)
    {
        int thickness = Math.Max(1, (int)Math.Round(Math.Min(tile.Width, tile.Height) * _o.TileBorderFraction));
        if (thickness * 2 >= Math.Min(tile.Width, tile.Height)) return;

        // Pha NGƯỢC chiều nền: trên nền tối thì viền sáng lên, trên nền giấy thì
        // viền tối lại. Pha cùng chiều nền là cách chắc chắn nhất để viền tan
        // vào nền và hình chữ mất biên.
        float amount = (float)Math.Clamp(_o.TileBorderContrast, 0.0, 0.9);
        var target = theme == BackdropTheme.Dark ? Vector3.One : Vector3.Zero;
        var color = ToPixel(Vector3.Lerp(tint, target, amount));

        tile.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                bool horizontalEdge = y < thickness || y >= accessor.Height - thickness;
                if (horizontalEdge)
                {
                    row.Fill(color);
                    continue;
                }
                for (int t = 0; t < thickness; t++)
                {
                    row[t] = color;
                    row[row.Length - 1 - t] = color;
                }
            }
        });
    }

    // ── Logo: chính ảnh PNG thương hiệu, nên không cần thư viện vẽ chữ ─────
    private async Task DrawLogoAsync(
        Image<Rgb24> canvas, ImageSharpConfiguration cfg, BackdropSpec spec, CancellationToken ct)
    {
        if (!_o.ShowLogo) return;

        var logoPath = Path.Combine(WebRoot, "LOGO 15th IRIS - FINAL _LOGO 15th IRIS - CHOT2.png");
        if (!File.Exists(logoPath))
        {
            logger.LogWarning("Không tìm thấy file logo tại {Path}; bỏ qua khối logo.", logoPath);
            return;
        }

        int bleed = spec.MmToPx(spec.BleedMm);
        int safe = spec.MmToPx(spec.SafeMarginMm);
        int safeW = spec.MmToPx(spec.TrimWidthMm) - safe * 2;

        int targetW = Math.Max(1, (int)Math.Round(safeW * Math.Clamp(_o.LogoWidthFraction, 0.02, 0.5)));

        using var logo = await Image.LoadAsync<Rgba32>(cfg, logoPath, ct);
        int targetH = Math.Max(1, (int)Math.Round((double)logo.Height / logo.Width * targetW));
        logo.Mutate(x => x.Resize(targetW, targetH, KnownResamplers.Lanczos3));

        canvas.Mutate(x => x.DrawImage(logo, new Point(bleed + safe, bleed + safe), 1f));
    }

    // ── Mã QR dẫn về trang gửi ảnh ─────────────────────────────────────────
    private void DrawQrCode(Image<Rgb24> canvas, ImageSharpConfiguration cfg, BackdropSpec spec)
    {
        if (!_o.ShowQrCode || string.IsNullOrWhiteSpace(_o.QrPayload)) return;

        int bleed = spec.MmToPx(spec.BleedMm);
        int safe = spec.MmToPx(spec.SafeMarginMm);
        int safeW = spec.MmToPx(spec.TrimWidthMm) - safe * 2;
        int safeH = spec.MmToPx(spec.TrimHeightMm) - safe * 2;

        int target = Math.Max(1, (int)Math.Round(safeW * Math.Clamp(_o.QrWidthFraction, 0.02, 0.3)));

        try
        {
            using var generator = new QRCodeGenerator();
            // ECC mức Q: mã vẫn quét được cả khi bạt bị bẩn hoặc gấp nếp.
            using var data = generator.CreateQrCode(_o.QrPayload, QRCodeGenerator.ECCLevel.Q);
            var pngBytes = new PngByteQRCode(data).GetGraphic(20);

            using var qr = Image.Load<Rgb24>(cfg, pngBytes);
            qr.Mutate(x => x.Resize(target, target, KnownResamplers.NearestNeighbor));

            int x0 = bleed + safe + safeW - target;
            int y0 = bleed + safe + safeH - target;

            // Nền trắng quanh mã: mã QR trên nền tối rất khó quét.
            int pad = Math.Max(2, target / 12);
            using var plate = new Image<Rgb24>(cfg, target + pad * 2, target + pad * 2);
            plate.Mutate(p => p.BackgroundColor(Color.White));
            plate.Mutate(p => p.DrawImage(qr, new Point(pad, pad), 1f));

            canvas.Mutate(c => c.DrawImage(plate, new Point(x0 - pad, y0 - pad), 1f));
        }
        catch (Exception ex)
        {
            logger.LogWarning("Không tạo được mã QR: {Message}", ex.Message);
        }
    }

    private static void ApplyMetadata(ImageMetadata metadata, BackdropSpec spec)
    {
        metadata.ResolutionUnits = PixelResolutionUnit.PixelsPerInch;
        metadata.HorizontalResolution = spec.MetadataDpi;
        metadata.VerticalResolution = spec.MetadataDpi;
    }

    private IImageEncoder EncoderFor(BackdropSpec spec) => spec.Format switch
    {
        BackdropFormat.Tiff => new TiffEncoder
        {
            BitsPerPixel = TiffBitsPerPixel.Bit24,
            Compression = TiffCompression.Deflate,
            PhotometricInterpretation = TiffPhotometricInterpretation.Rgb,
        },
        BackdropFormat.Png => new PngEncoder
        {
            ColorType = PngColorType.Rgb,
            CompressionLevel = PngCompressionLevel.Level6,
            ChunkFilter = PngChunkFilter.ExcludeAll,
        },
        _ => new JpegEncoder
        {
            Quality = Math.Clamp(spec.JpegQuality, 60, 100),
            // 4:4:4 — không giảm mẫu màu. Bức khảm có rất nhiều biên màu sát nhau,
            // 4:2:0 sẽ làm nhoè đúng những đường viền tạo nên hình chữ.
            ColorType = JpegColorType.YCbCrRatio444,
        },
    };

    private static Vector3 ParseColor(string hex)
    {
        var c = Color.ParseHex(hex).ToPixel<Rgb24>();
        return new Vector3(c.R / 255f, c.G / 255f, c.B / 255f);
    }

    private Vector3 BackgroundFor(BackdropTheme theme) => ParseColor(
        theme == BackdropTheme.Dark ? _o.BackgroundColorDark : _o.BackgroundColorLight);

    /// <summary>
    /// Ô chưa có ảnh. Trên nền tối thì tối hơn màu chữ, trên nền giấy thì nhạt
    /// hơn — cả hai đều để ô lùi lại sau ô có ảnh thật.
    /// </summary>
    private Vector3 EmptyPlateColor(Vector3 tint, BackdropTheme theme)
    {
        float mix = (float)Math.Clamp(_o.EmptyPlateMix, 0.0, 0.95);
        return theme == BackdropTheme.Dark
            ? tint * (1f - mix * 0.6f)
            : Vector3.Lerp(tint, Vector3.One, mix * 0.85f);
    }

    private static Rgb24 ToPixel(Vector3 v) => new(
        (byte)Math.Clamp(v.X * 255f, 0, 255),
        (byte)Math.Clamp(v.Y * 255f, 0, 255),
        (byte)Math.Clamp(v.Z * 255f, 0, 255));

    /// <summary>
    /// Tô đặc toàn bộ ảnh.
    ///
    /// KHÔNG dùng <c>BackgroundColor</c>: hàm đó vẽ màu ở PHÍA SAU nội dung sẵn
    /// có, mà ảnh Rgb24 mới tạo đã là đen đục hoàn toàn nên nó không đổi gì.
    /// Ghi thẳng vào từng hàng điểm ảnh mới thực sự tô được.
    /// </summary>
    private static void FillSolid(Image<Rgb24> image, Vector3 color)
    {
        var pixel = ToPixel(color);
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++) accessor.GetRowSpan(y).Fill(pixel);
        });
    }
}
