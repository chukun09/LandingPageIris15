using System.Security.Cryptography;
using System.Text;
using LandingPageEvent.Configuration;

namespace LandingPageEvent.Models.Backdrop;

/// <summary>
/// Một yêu cầu dựng file in cụ thể. Tách khỏi <see cref="BackdropOptions"/> để
/// admin đổi khổ/DPI cho từng lần xuất mà không phải sửa cấu hình máy chủ.
/// </summary>
public sealed record BackdropSpec(
    int TrimWidthMm,
    int TrimHeightMm,
    int BleedMm,
    int SafeMarginMm,
    int EffectiveDpi,
    int ScaleDenominator,
    BackdropFormat Format,
    int JpegQuality,
    TintMode Tint,
    BackdropTheme Theme)
{
    public static BackdropSpec FromOptions(BackdropOptions o) => new(
        o.TrimWidthMm, o.TrimHeightMm, o.BleedMm, o.SafeMarginMm,
        o.EffectiveDpi, o.ScaleDenominator, o.Format, o.JpegQuality, o.Tint, o.Theme);

    public int CanvasWidthMm => TrimWidthMm + BleedMm * 2;
    public int CanvasHeightMm => TrimHeightMm + BleedMm * 2;

    public int CanvasWidthPx => MmToPx(CanvasWidthMm);
    public int CanvasHeightPx => MmToPx(CanvasHeightMm);

    public long Megapixels => (long)CanvasWidthPx * CanvasHeightPx / 1_000_000;

    /// <summary>DPI ghi vào metadata: bằng DPI thực nhân tỷ lệ thu nhỏ.</summary>
    public int MetadataDpi => EffectiveDpi * Math.Max(1, ScaleDenominator);

    public int MmToPx(double mm) => (int)Math.Round(mm / 25.4 * EffectiveDpi);

    public string Extension => Format switch
    {
        BackdropFormat.Tiff => "tif",
        BackdropFormat.Png => "png",
        _ => "jpg",
    };

    /// <summary>Băm toàn bộ thông số, dùng làm khoá cache đĩa.</summary>
    public string Hash()
    {
        var raw = string.Join('|',
            TrimWidthMm, TrimHeightMm, BleedMm, SafeMarginMm,
            EffectiveDpi, ScaleDenominator, Format, JpegQuality, Tint, Theme);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)), 0, 6).ToLowerInvariant();
    }

    /// <summary>Tên file mang đúng thông số in, để nhà in không phải hỏi lại.</summary>
    public string FileName(string layoutId, int photoCount) =>
        $"IRIS15_{Theme.ToString().ToLowerInvariant()}" +
        $"_{TrimWidthMm}x{TrimHeightMm}mm_{EffectiveDpi}dpi_1to{ScaleDenominator}" +
        $"_N{photoCount}_{layoutId[..Math.Min(8, layoutId.Length)]}.{Extension}";
}

/// <summary>Cảnh báo về một ảnh không đủ độ phân giải cho ô mà nó được gán.</summary>
public sealed record BackdropWarning(int PostId, int SourceShortEdgePx, int RequiredPx, int TileIndex);

public enum BackdropJobState
{
    Queued,
    Running,
    Completed,
    Failed,
}

public sealed class BackdropJob
{
    public required Guid Id { get; init; }
    public required BackdropSpec Spec { get; init; }
    public required string LayoutId { get; init; }
    public required int PhotoCount { get; init; }

    public BackdropJobState State { get; set; } = BackdropJobState.Queued;
    public double Progress { get; set; }
    public string Stage { get; set; } = "Đang xếp hàng";
    public string? Error { get; set; }

    public string? FilePath { get; set; }
    public string? PreviewPath { get; set; }
    public long FileBytes { get; set; }
    public List<BackdropWarning> Warnings { get; } = [];
}
