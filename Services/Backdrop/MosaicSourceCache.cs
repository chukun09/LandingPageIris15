using LandingPageEvent.Configuration;
using LandingPageEvent.Services.Imaging;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace LandingPageEvent.Services.Backdrop;

public sealed record SourceImageInfo(int PostId, string Path, int Width, int Height)
{
    public int ShortEdge => Math.Min(Width, Height);
}

public interface IMosaicSourceCache
{
    /// <summary>Kích thước ảnh gốc, đọc từ header nên không giải mã toàn ảnh.</summary>
    Task<IReadOnlyDictionary<int, SourceImageInfo>> IdentifyAsync(
        IReadOnlyDictionary<int, string> originalPaths, CancellationToken ct);

    /// <summary>
    /// Trả về đường dẫn bản trung gian đã cắt vuông của một ảnh, tạo mới nếu chưa có.
    /// Null nếu ảnh gốc không dùng được.
    /// </summary>
    Task<string?> GetOrCreateAsync(int postId, string originalRelativePath, CancellationToken ct);
}

/// <summary>
/// Bản trung gian của ảnh gốc dùng khi ghép backdrop.
///
/// Lý do tồn tại: ghép trực tiếp từ ảnh gốc nghĩa là giải mã một ảnh 12 MP
/// (~48 MB ở Rgba32) cho MỖI ô. Bản 1600×1600 chỉ tốn ~7.7 MB và vẫn dư độ phân
/// giải cho ô lớn nhất trên bản in.
/// </summary>
public sealed class MosaicSourceCache(
    IOptions<BackdropOptions> options,
    IImagePolicy imagePolicy,
    IWebHostEnvironment environment,
    ILogger<MosaicSourceCache> logger,
    Storage.IStorageService? storageService = null) : IMosaicSourceCache
{
    private readonly BackdropOptions _o = options.Value;

    private string WebRoot => environment.WebRootPath
                              ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

    private string CacheDir => Path.Combine(WebRoot, _o.SourceCacheDirectory.Replace('/', Path.DirectorySeparatorChar));

    public async Task<IReadOnlyDictionary<int, SourceImageInfo>> IdentifyAsync(
        IReadOnlyDictionary<int, string> originalPaths, CancellationToken ct)
    {
        var result = new Dictionary<int, SourceImageInfo>(originalPaths.Count);

        foreach (var (postId, relative) in originalPaths)
        {
            ct.ThrowIfCancellationRequested();
            Stream? stream = null;
            if (storageService != null)
            {
                stream = await storageService.GetFileStreamAsync(relative, ct);
            }
            else
            {
                var path = Resolve(relative);
                if (File.Exists(path)) stream = File.OpenRead(path);
            }

            if (stream == null) continue;

            try
            {
                using (stream)
                {
                    // Image.Identify chỉ đọc header — vài chục micro giây mỗi file,
                    // nên không cần lưu kích thước vào cơ sở dữ liệu.
                    var info = await Image.IdentifyAsync(imagePolicy.Configuration, stream, ct);
                    if (info is null) continue;
                    result[postId] = new SourceImageInfo(postId, relative, info.Width, info.Height);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Không đọc được kích thước ảnh {Path}: {Message}", relative, ex.Message);
            }
        }

        return result;
    }

    public async Task<string?> GetOrCreateAsync(int postId, string originalRelativePath, CancellationToken ct)
    {
        Directory.CreateDirectory(CacheDir);
        var name = $"{Path.GetFileNameWithoutExtension(originalRelativePath)}_{_o.SourceCacheEdgePx}.jpg";
        var cached = Path.Combine(CacheDir, name);

        if (File.Exists(cached))
        {
            return cached;
        }

        Stream? stream = null;
        if (storageService != null)
        {
            stream = await storageService.GetFileStreamAsync(originalRelativePath, ct);
        }
        else
        {
            var source = Resolve(originalRelativePath);
            if (File.Exists(source)) stream = File.OpenRead(source);
        }

        if (stream == null) return null;

        try
        {
            using (stream)
            using (var image = await Image.LoadAsync<Rgb24>(imagePolicy.Configuration, stream, ct))
            {
                image.Mutate(x => x.Resize(new ResizeOptions
                {
                    Size = new Size(_o.SourceCacheEdgePx, _o.SourceCacheEdgePx),
                    Mode = ResizeMode.Crop,
                    Sampler = KnownResamplers.Lanczos3,
                }));

                await using var fileStream = new FileStream(cached, FileMode.Create, FileAccess.Write, FileShare.None);
                await image.SaveAsync(fileStream, new JpegEncoder { Quality = 90 }, ct);
                return cached;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Không tạo được bản đệm cho ảnh {Path}: {Message}", originalRelativePath, ex.Message);
            return null;
        }
    }

    private string Resolve(string webRelativePath) =>
        Path.Combine(WebRoot, webRelativePath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar));
}
