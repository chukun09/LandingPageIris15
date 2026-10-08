using System.Collections.Concurrent;
using System.Text.Json;
using LandingPageEvent.Models.Mosaic;
using LandingPageEvent.Services.Imaging;
using LandingPageEvent.Services.Storage;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace LandingPageEvent.Services.Mosaic;

public sealed record MosaicPublishedConfig(
    bool IsPublished,
    DateTimeOffset? PublishedAt,
    string? LayoutId,
    List<int> OrderedPostIds,
    int PhotoCount,
    Dictionary<int, int>? TileAssignments = null);

public sealed record MosaicPostAssignmentDto(
    int PostId,
    int Rank,
    string LetterId,
    string LetterChar,
    string TintRole,
    int AreaUnits,
    bool IsLargeTile);

public sealed record MosaicPublishStateDto(
    bool IsPublished,
    DateTimeOffset? PublishedAt,
    string? LayoutId,
    int PhotoCount,
    List<int> CurrentOrder,
    List<MosaicPostAssignmentDto> Assignments,
    Dictionary<int, int>? TileAssignments = null);

public interface IMosaicPublishService
{
    Task<MosaicPublishStateDto> GetStateAsync(CancellationToken ct);
    Task<MosaicPublishStateDto> PublishAsync(List<int> orderedPostIds, Dictionary<int, int>? tileAssignments, CancellationToken ct);
    Task<MosaicPublishStateDto> ResetToDefaultAsync(CancellationToken ct);
    Task<MosaicLayout?> GetPublishedLayoutAsync(CancellationToken ct);
    Task<MosaicAtlas?> GetPublishedAtlasAsync(int tileSize, CancellationToken ct);
}

public sealed class MosaicPublishService : IMosaicPublishService
{
    private const string ConfigPath = "uploads/mosaic/published_config.json";
    private static readonly int[] SupportedTileSizes = [64, 128];
    private const int AtlasWidth = 2048;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMosaicLayoutService _layoutService;
    private readonly IImagePolicy _imagePolicy;
    private readonly IStorageService? _storageService;
    private readonly ILogger<MosaicPublishService> _logger;

    private MosaicPublishedConfig? _cachedConfig;
    private MosaicLayout? _cachedLayout;
    private readonly ConcurrentDictionary<int, MosaicAtlas> _cachedAtlases = new();
    private readonly SemaphoreSlim _lock = new(1, 1);
    private bool _hasInitialized;

    public MosaicPublishService(
        IServiceScopeFactory scopeFactory,
        IMosaicLayoutService layoutService,
        IImagePolicy imagePolicy,
        ILogger<MosaicPublishService> logger,
        IStorageService? storageService = null)
    {
        _scopeFactory = scopeFactory;
        _layoutService = layoutService;
        _imagePolicy = imagePolicy;
        _logger = logger;
        _storageService = storageService;
    }

    private async Task EnsureInitializedAsync(CancellationToken ct)
    {
        if (_hasInitialized) return;
        await _lock.WaitAsync(ct);
        try
        {
            if (_hasInitialized) return;
            if (_storageService != null)
            {
                var stream = await _storageService.GetFileStreamAsync(ConfigPath, ct);
                if (stream != null)
                {
                    using (stream)
                    {
                        _cachedConfig = await JsonSerializer.DeserializeAsync<MosaicPublishedConfig>(
                            stream, cancellationToken: ct);
                        _logger.LogInformation(
                            "Đã khôi phục cấu hình Mosaic đã xuất bản từ Storage (LayoutId: {LayoutId}, {Count} ảnh)",
                            _cachedConfig?.LayoutId, _cachedConfig?.PhotoCount);
                    }
                }
            }
            _hasInitialized = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể đọc cấu hình Mosaic đã xuất bản từ Storage, chuyển về chế độ mặc định.");
            _hasInitialized = true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<MosaicPublishStateDto> GetStateAsync(CancellationToken ct)
    {
        await EnsureInitializedAsync(ct);

        using var scope = _scopeFactory.CreateScope();
        var postService = scope.ServiceProvider.GetRequiredService<IPostService>();
        var posts = await postService.GetMosaicPostRefsAsync(ct);

        var currentOrder = _cachedConfig?.IsPublished == true && _cachedConfig.OrderedPostIds.Count > 0
            ? _cachedConfig.OrderedPostIds
            : posts
                .OrderByDescending(p => p.VoteCount)
                .ThenBy(p => p.CreatedAt)
                .ThenBy(p => p.Id)
                .Select(p => p.Id)
                .ToList();

        // Đảm bảo các bài viết mới chưa có trong order cũ được đưa vào cuối
        var currentSet = new HashSet<int>(currentOrder);
        foreach (var p in posts)
        {
            if (!currentSet.Contains(p.Id))
            {
                currentOrder.Add(p.Id);
            }
        }

        var tileAssignments = _cachedConfig?.TileAssignments;
        var layout = _layoutService.Build(posts, customOrder: currentOrder, customTileAssignments: tileAssignments);
        var assignments = BuildAssignments(layout);

        return new MosaicPublishStateDto(
            IsPublished: _cachedConfig?.IsPublished == true,
            PublishedAt: _cachedConfig?.PublishedAt,
            LayoutId: _cachedConfig?.IsPublished == true ? _cachedConfig.LayoutId : layout.LayoutId,
            PhotoCount: posts.Count,
            CurrentOrder: currentOrder,
            Assignments: assignments,
            TileAssignments: tileAssignments);
    }

    public async Task<MosaicPublishStateDto> PublishAsync(
        List<int> orderedPostIds,
        Dictionary<int, int>? tileAssignments,
        CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var postService = scope.ServiceProvider.GetRequiredService<IPostService>();
            var posts = await postService.GetMosaicPostRefsAsync(ct);

            // Bổ sung các bài viết mới chưa có trong danh sách
            var orderSet = new HashSet<int>(orderedPostIds);
            var finalOrder = new List<int>(orderedPostIds);
            foreach (var p in posts)
            {
                if (!orderSet.Contains(p.Id))
                {
                    finalOrder.Add(p.Id);
                }
            }

            // 1. Dựng layout theo thứ tự và vị trí ô tùy chỉnh
            var layout = _layoutService.Build(
                posts,
                customOrder: finalOrder,
                customTileAssignments: tileAssignments);

            // 2. Render Atlas chất lượng cao (luôn sắp xếp theo Id để khớp tuyệt đối với idToAtlasSlot)
            var orderedForAtlas = posts.OrderBy(p => p.Id).ToList();

            _cachedAtlases.Clear();

            foreach (var tileSize in SupportedTileSizes)
            {
                ct.ThrowIfCancellationRequested();
                var atlas = await RenderHighQualityAtlasAsync(tileSize, orderedForAtlas, postService, layout.LayoutId, ct);
                _cachedAtlases[tileSize] = atlas;

                // Lưu file Atlas tĩnh lên Storage
                if (_storageService != null)
                {
                    using var ms = new MemoryStream(atlas.Bytes);
                    await _storageService.SaveFileAsync(
                        ms,
                        $"uploads/mosaic/atlas_published_{tileSize}_{layout.LayoutId}.webp",
                        "image/webp",
                        ct);
                }
            }

            // 3. Lưu cấu hình đã xuất bản
            var config = new MosaicPublishedConfig(
                IsPublished: true,
                PublishedAt: DateTimeOffset.UtcNow,
                LayoutId: layout.LayoutId,
                OrderedPostIds: finalOrder,
                PhotoCount: posts.Count,
                TileAssignments: tileAssignments);

            if (_storageService != null)
            {
                var json = JsonSerializer.SerializeToUtf8Bytes(config, new JsonSerializerOptions { WriteIndented = true });
                using var jsonMs = new MemoryStream(json);
                await _storageService.SaveFileAsync(jsonMs, ConfigPath, "application/json", ct);
            }

            _cachedConfig = config;
            _cachedLayout = layout;
            _hasInitialized = true;

            _logger.LogInformation("Đã xuất bản thành công Bố cục Mosaic IRIS 15 (LayoutId: {LayoutId}, {Count} ảnh)", layout.LayoutId, posts.Count);

            var assignments = BuildAssignments(layout);
            return new MosaicPublishStateDto(
                IsPublished: true,
                PublishedAt: config.PublishedAt,
                LayoutId: layout.LayoutId,
                PhotoCount: posts.Count,
                CurrentOrder: finalOrder,
                Assignments: assignments,
                TileAssignments: tileAssignments);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<MosaicPublishStateDto> ResetToDefaultAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (_storageService != null)
            {
                await _storageService.DeleteFileAsync(ConfigPath, ct);
            }

            _cachedConfig = null;
            _cachedLayout = null;
            _cachedAtlases.Clear();

            return await GetStateAsync(ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<MosaicLayout?> GetPublishedLayoutAsync(CancellationToken ct)
    {
        await EnsureInitializedAsync(ct);
        if (_cachedConfig?.IsPublished != true || string.IsNullOrEmpty(_cachedConfig.LayoutId))
        {
            return null;
        }

        if (_cachedLayout != null && _cachedLayout.LayoutId == _cachedConfig.LayoutId)
        {
            return _cachedLayout;
        }

        using var scope = _scopeFactory.CreateScope();
        var postService = scope.ServiceProvider.GetRequiredService<IPostService>();
        var posts = await postService.GetMosaicPostRefsAsync(ct);

        _cachedLayout = _layoutService.Build(
            posts,
            customOrder: _cachedConfig.OrderedPostIds,
            customTileAssignments: _cachedConfig.TileAssignments);
        return _cachedLayout;
    }

    public async Task<MosaicAtlas?> GetPublishedAtlasAsync(int tileSize, CancellationToken ct)
    {
        await EnsureInitializedAsync(ct);
        if (_cachedConfig?.IsPublished != true || string.IsNullOrEmpty(_cachedConfig.LayoutId))
        {
            return null;
        }

        if (_cachedAtlases.TryGetValue(tileSize, out var cached))
        {
            return cached;
        }

        if (_storageService != null)
        {
            var relativePath = $"uploads/mosaic/atlas_published_{tileSize}_{_cachedConfig.LayoutId}.webp";
            var stream = await _storageService.GetFileStreamAsync(relativePath, ct);
            if (stream != null)
            {
                using (stream)
                using (var ms = new MemoryStream())
                {
                    await stream.CopyToAsync(ms, ct);
                    var bytes = ms.ToArray();
                    int columns = AtlasWidth / tileSize;
                    int rows = Math.Max(1, (int)Math.Ceiling((double)_cachedConfig.PhotoCount / columns));
                    var atlas = new MosaicAtlas(
                        Bytes: bytes,
                        ContentType: "image/webp",
                        ETag: $"\"{_cachedConfig.LayoutId}\"",
                        TileSize: tileSize,
                        Columns: columns,
                        Rows: rows,
                        Width: AtlasWidth,
                        Height: rows * tileSize,
                        PhotoCount: _cachedConfig.PhotoCount);

                    _cachedAtlases[tileSize] = atlas;
                    return atlas;
                }
            }
        }

        return null;
    }

    private async Task<MosaicAtlas> RenderHighQualityAtlasAsync(
        int tileSize,
        List<MosaicPostRef> ordered,
        IPostService postService,
        string layoutId,
        CancellationToken ct)
    {
        int columns = AtlasWidth / tileSize;
        int count = ordered.Count;
        int rows = Math.Max(1, (int)Math.Ceiling((double)count / columns));
        int height = rows * tileSize;

        var configuration = _imagePolicy.Configuration;
        using var canvas = new Image<Rgba32>(configuration, AtlasWidth, height);

        for (int i = 0; i < count; i++)
        {
            ct.ThrowIfCancellationRequested();
            int postId = ordered[i].Id;

            Stream? stream = null;
            try
            {
                // Ưu tiên Preview stream (1600px) cho độ nét cao nhất, fallback sang Thumbnail nếu cần
                stream = await postService.GetPreviewStreamAsync(postId, ct)
                         ?? await postService.GetThumbnailStreamAsync(postId, ct);

                if (stream == null) continue;

                using (stream)
                using (var tile = await Image.LoadAsync<Rgba32>(configuration, stream, ct))
                {
                    tile.Mutate(x =>
                    {
                        x.AutoOrient();
                        x.Resize(new ResizeOptions
                        {
                            Size = new Size(tileSize, tileSize),
                            Mode = ResizeMode.Crop,
                            Sampler = KnownResamplers.Lanczos3,
                        });
                    });

                    int column = i % columns;
                    int row = i / columns;
                    canvas.Mutate(x => x.DrawImage(tile, new Point(column * tileSize, row * tileSize), 1f));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Bỏ qua lỗi xử lý ảnh cho bài đăng #{PostId} khi dựng Atlas", postId);
            }
        }

        using var buffer = new MemoryStream();
        await canvas.SaveAsync(buffer, new WebpEncoder { Quality = 85 }, ct);

        return new MosaicAtlas(
            Bytes: buffer.ToArray(),
            ContentType: "image/webp",
            ETag: $"\"{layoutId}\"",
            TileSize: tileSize,
            Columns: columns,
            Rows: rows,
            Width: AtlasWidth,
            Height: height,
            PhotoCount: count);
    }

    private static List<MosaicPostAssignmentDto> BuildAssignments(MosaicLayout layout)
    {
        var result = new List<MosaicPostAssignmentDto>();
        var letterMap = layout.Letters.ToDictionary(l => l.Id);

        // Tìm diện tích lớn nhất để đánh dấu ô lớn (VIP Hero Tile)
        int maxArea = layout.Tiles.Count > 0 ? layout.Tiles.Max(t => t.AreaUnits) : 0;
        int largeThreshold = (int)(maxArea * 0.7);

        foreach (var t in layout.Tiles.Where(t => t.PostId > 0))
        {
            letterMap.TryGetValue(t.LetterId, out var letter);
            result.Add(new MosaicPostAssignmentDto(
                PostId: t.PostId,
                Rank: t.Rank,
                LetterId: t.LetterId,
                LetterChar: letter?.Char ?? t.LetterId,
                TintRole: letter?.TintRole ?? "gold",
                AreaUnits: t.AreaUnits,
                IsLargeTile: t.AreaUnits >= largeThreshold));
        }

        return result.OrderBy(a => a.Rank).ToList();
    }
}
