using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using LandingPageEvent.Models.Mosaic;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

using ImageSharpConfiguration = SixLabors.ImageSharp.Configuration;

namespace LandingPageEvent.Services.Mosaic;

public sealed record MosaicAtlas(
    byte[] Bytes,
    string ContentType,
    string ETag,
    int TileSize,
    int Columns,
    int Rows,
    int Width,
    int Height,
    int PhotoCount);

public interface IMosaicAtlasService
{
    /// <summary>
    /// Một ảnh duy nhất chứa toàn bộ ảnh đã duyệt, xếp theo đúng thứ tự hạng của
    /// bố cục — nên ô thứ <c>rank</c> luôn lấy đúng ô atlas thứ <c>rank</c>.
    /// </summary>
    Task<MosaicAtlas> GetAsync(int tileSize, CancellationToken ct);
}

/// <summary>
/// Gộp toàn bộ ảnh thu nhỏ vào một sprite atlas.
///
/// Lý do tồn tại: cách cũ nạp mỗi ảnh thành một texture riêng và tạo một
/// InstancedMesh cho mỗi URL — với 150 ảnh là ~150 request, ~95 MB VRAM không
/// bao giờ được giải phóng, và vì material là mảng 6 phần tử trên BoxGeometry
/// nên mỗi mesh tốn 6 lệnh vẽ. Một atlas đưa tất cả về 1 request và 1 lệnh vẽ.
///
/// Ràng buộc quan trọng: atlas phải là luỹ thừa 2 và các ô phải căn theo lưới ô,
/// để các mức mipmap từ 0 tới log2(tile) không trộn hai ô cạnh nhau.
/// </summary>
/// <remarks>
/// Đăng ký Singleton để cache atlas sống qua nhiều request, nên phải tự mở scope
/// khi cần <see cref="IPostService"/> (vốn là Scoped vì bám theo DbContext).
/// </remarks>
public sealed class MosaicAtlasService(
    IServiceScopeFactory scopeFactory,
    Imaging.IImagePolicy imagePolicy,
    IWebHostEnvironment environment) : IMosaicAtlasService
{
    /// <summary>Bề rộng atlas cố định. WebGL2 bảo đảm MAX_TEXTURE_SIZE ≥ 2048.</summary>
    public const int AtlasWidth = 2048;

    private static readonly int[] AllowedTileSizes = [32, 64, 128, 256];

    private readonly ConcurrentDictionary<string, MosaicAtlas> _cache = new();

    public async Task<MosaicAtlas> GetAsync(int tileSize, CancellationToken ct)
    {
        if (!AllowedTileSizes.Contains(tileSize))
        {
            throw new ArgumentException(
                $"Kích thước ô atlas phải là một trong {string.Join(", ", AllowedTileSizes)}.",
                nameof(tileSize));
        }

        using var scope = scopeFactory.CreateScope();
        var postService = scope.ServiceProvider.GetRequiredService<IPostService>();

        var posts = await postService.GetMosaicPostRefsAsync(ct);

        // Cùng thứ tự với MosaicLayoutService để slot atlas trùng với rank của ô.
        var ordered = posts
            .OrderByDescending(p => p.VoteCount)
            .ThenBy(p => p.CreatedAt)
            .ThenBy(p => p.Id)
            .ToList();

        var key = BuildKey(tileSize, ordered);
        if (_cache.TryGetValue(key, out var cached)) return cached;

        var thumbnails = await postService.GetThumbnailPathsAsync(ct);
        var atlas = await BuildAsync(tileSize, ordered, thumbnails, key, ct);

        if (_cache.Count > 8) _cache.Clear();
        _cache[key] = atlas;
        return atlas;
    }

    private async Task<MosaicAtlas> BuildAsync(
        int tileSize,
        List<MosaicPostRef> ordered,
        IReadOnlyDictionary<int, string> thumbnails,
        string key,
        CancellationToken ct)
    {
        int columns = AtlasWidth / tileSize;
        int count = ordered.Count;
        int rows = Math.Max(1, (int)Math.Ceiling((double)count / columns));
        int height = rows * tileSize;

        var webRoot = environment.WebRootPath
                      ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

        var configuration = imagePolicy.Configuration;
        using var canvas = new Image<Rgba32>(configuration, AtlasWidth, height);

        for (int i = 0; i < count; i++)
        {
            ct.ThrowIfCancellationRequested();

            if (!thumbnails.TryGetValue(ordered[i].Id, out var relativePath)) continue;
            var path = Path.Combine(webRoot, relativePath.TrimStart('/', '\\')
                                                         .Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(path)) continue;

            try
            {
                using var tile = await Image.LoadAsync<Rgba32>(configuration, path, ct);
                tile.Mutate(x => x.Resize(new ResizeOptions
                {
                    Size = new Size(tileSize, tileSize),
                    Mode = ResizeMode.Crop,
                    Sampler = KnownResamplers.Lanczos3,
                }));

                int column = i % columns;
                int row = i / columns;
                canvas.Mutate(x => x.DrawImage(tile, new Point(column * tileSize, row * tileSize), 1f));
            }
            catch
            {
                // Một ảnh hỏng không được làm hỏng cả atlas; ô đó để trong suốt.
            }
        }

        using var buffer = new MemoryStream();
        await canvas.SaveAsync(buffer, new WebpEncoder { Quality = 82 }, ct);

        return new MosaicAtlas(
            Bytes: buffer.ToArray(),
            ContentType: "image/webp",
            ETag: $"\"{key}\"",
            TileSize: tileSize,
            Columns: columns,
            Rows: rows,
            Width: AtlasWidth,
            Height: height,
            PhotoCount: count);
    }

    private static string BuildKey(int tileSize, List<MosaicPostRef> ordered)
    {
        var sb = new StringBuilder().Append(tileSize).Append('|').Append(ordered.Count).Append('|');
        foreach (var p in ordered) sb.Append(p.Id).Append(',');

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(hash, 0, 12).ToLowerInvariant();
    }
}
