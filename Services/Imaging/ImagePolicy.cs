using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;

// Dự án có namespace LandingPageEvent.Configuration nên phải đặt bí danh rõ ràng.
using ImageSharpConfiguration = SixLabors.ImageSharp.Configuration;

namespace LandingPageEvent.Services.Imaging;

public sealed record ImageValidation(
    bool Ok,
    string? Error = null,
    string? Format = null,
    int Width = 0,
    int Height = 0)
{
    public long Pixels => (long)Width * Height;
}

public interface IImagePolicy
{
    /// <summary>Cấu hình ImageSharp chỉ đăng ký các bộ giải mã được phép.</summary>
    ImageSharpConfiguration Configuration { get; }

    /// <summary>Đuôi file được chấp nhận ở form upload.</summary>
    IReadOnlySet<string> AllowedExtensions { get; }

    /// <summary>
    /// Đọc phần đầu luồng để xác định định dạng thật và kích thước. Luồng được
    /// tua về vị trí ban đầu sau khi kiểm tra.
    /// </summary>
    Task<ImageValidation> ValidateAsync(Stream stream, CancellationToken ct);
}

/// <summary>
/// Chốt chặn ảnh tải lên.
///
/// Hai điểm quan trọng:
/// 1. ImageSharp nhận diện định dạng theo <b>nội dung file</b>, không theo đuôi.
///    Danh sách đuôi cho phép ở endpoint vì thế không ngăn được một file GIF
///    đổi tên thành .png chạm tới bộ giải mã GIF — nơi cả CVE-2025-27598 và
///    CVE-2025-54575 nằm. Ở đây ta đăng ký <b>chỉ</b> ba bộ giải mã cần dùng,
///    nên bộ giải mã GIF không tồn tại trong quá trình chạy.
/// 2. Ảnh nén rất nhỏ có thể giải nén ra hàng trăm triệu điểm ảnh. Ta đọc
///    header trước để biết kích thước và từ chối trước khi cấp phát bộ nhớ.
/// </summary>
public sealed class ImagePolicy : IImagePolicy
{
    /// <summary>Trần số điểm ảnh mặc định (~50 MP). Ảnh điện thoại 12 MP nằm rất xa ngưỡng này.</summary>
    public const long DefaultMaxPixels = 50_000_000;

    private readonly long _maxPixels;

    public ImagePolicy() : this(DefaultMaxPixels) { }

    public ImagePolicy(long maxPixels) => _maxPixels = maxPixels;

    private static readonly HashSet<string> Extensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp" };

    // Tên định dạng do ImageSharp báo cáo, đối chiếu để chắc chắn nội dung khớp.
    private static readonly HashSet<string> FormatNames =
        new(StringComparer.OrdinalIgnoreCase) { "PNG", "JPEG", "WEBP" };

    public ImageSharpConfiguration Configuration { get; } = BuildRestrictedConfiguration();

    public IReadOnlySet<string> AllowedExtensions => Extensions;

    private static ImageSharpConfiguration BuildRestrictedConfiguration()
    {
        // Không dùng Configuration.Default: nó đăng ký cả GIF, BMP, TGA, TIFF, PBM.
        var configuration = new ImageSharpConfiguration(
            new PngConfigurationModule(),
            new JpegConfigurationModule(),
            new WebpConfigurationModule());

        // Xử lý ảnh không được chiếm hết CPU của tiến trình web.
        configuration.MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount / 2);
        return configuration;
    }

    public async Task<ImageValidation> ValidateAsync(Stream stream, CancellationToken ct)
    {
        long origin = stream.CanSeek ? stream.Position : 0;

        try
        {
            IImageInfo? info;
            IImageFormat? format;
            try
            {
                info = await Image.IdentifyAsync(Configuration, stream, ct);
                format = info is null ? null : Image.DetectFormat(Configuration, ReadHeader(stream, origin));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return new ImageValidation(false, "Không đọc được file ảnh. File có thể bị hỏng.");
            }

            if (info is null || format is null)
            {
                return new ImageValidation(false,
                    "Nội dung file không phải ảnh JPG, PNG hay WebP hợp lệ.");
            }

            if (!FormatNames.Contains(format.Name))
            {
                return new ImageValidation(false,
                    $"Định dạng ảnh '{format.Name}' không được chấp nhận. Chỉ nhận JPG, PNG, WebP.");
            }

            long pixels = (long)info.Width * info.Height;
            if (pixels > _maxPixels)
            {
                return new ImageValidation(false,
                    $"Ảnh quá lớn ({info.Width}×{info.Height} = {pixels:N0} điểm ảnh). " +
                    $"Giới hạn {_maxPixels:N0} điểm ảnh.");
            }

            if (info.Width < 1 || info.Height < 1)
            {
                return new ImageValidation(false, "Ảnh không có kích thước hợp lệ.");
            }

            return new ImageValidation(true, null, format.Name, info.Width, info.Height);
        }
        finally
        {
            if (stream.CanSeek) stream.Position = origin;
        }
    }

    private static byte[] ReadHeader(Stream stream, long origin)
    {
        if (stream.CanSeek) stream.Position = origin;
        var buffer = new byte[64];
        int read = stream.Read(buffer, 0, buffer.Length);
        if (stream.CanSeek) stream.Position = origin;
        return read == buffer.Length ? buffer : buffer[..Math.Max(read, 0)];
    }
}
