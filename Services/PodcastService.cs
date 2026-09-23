using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using LandingPageEvent.Data;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;
using LandingPageEvent.Services.TTS;

namespace LandingPageEvent.Services;

public sealed class PodcastService : IPodcastService
{
    private readonly AppDbContext _context;
    private readonly IEnumerable<ITtsProvider> _ttsProviders;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PodcastService> _logger;
    private readonly IMemoryCache _cache;
    private readonly string _webRootPath;

    private const string PodcastsCacheKey = "PodcastService_Podcasts";
    private static readonly SemaphoreSlim _podcastLock = new(1, 1);

    public PodcastService(
        AppDbContext context,
        IEnumerable<ITtsProvider> ttsProviders,
        IConfiguration configuration,
        ILogger<PodcastService> logger,
        IMemoryCache? cache = null)
    {
        _context = context;
        _ttsProviders = ttsProviders;
        _configuration = configuration;
        _logger = logger;
        _cache = cache ?? new MemoryCache(new MemoryCacheOptions());
        _webRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    }

    public async Task<IReadOnlyList<PodcastResponse>> GetPodcastsAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue(PodcastsCacheKey, out IReadOnlyList<PodcastResponse>? cached) && cached != null)
        {
            return cached;
        }

        await _podcastLock.WaitAsync(ct);
        try
        {
            if (_cache.TryGetValue(PodcastsCacheKey, out cached) && cached != null)
            {
                return cached;
            }

            var episodes = await _context.PodcastEpisodes
                .AsNoTracking()
                .ToListAsync(ct);

            cached = episodes
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new PodcastResponse(
                    p.Id,
                    p.PostId,
                    p.Title,
                    p.AudioPath,
                    p.DurationSeconds,
                    p.CreatedAt))
                .ToList();

            _cache.Set(PodcastsCacheKey, cached, TimeSpan.FromMinutes(30));
            return cached;
        }
        finally
        {
            _podcastLock.Release();
        }
    }

    public async Task<PodcastResponse> GeneratePodcastAsync(int postId, string title, string? apiKey, string? region, CancellationToken ct)
    {
        // 1. Tìm bài đăng gốc
        var post = await _context.MemoryPosts.FindAsync(new object[] { postId }, ct);
        if (post == null)
        {
            throw new KeyNotFoundException($"Không tìm thấy bài viết với ID = {postId}");
        }

        // 2. Xác định Nhà cung cấp TTS chính và cấu hình Fallback
        var preferredProviderName = _configuration["TtsSettings:ActiveProvider"] ?? _configuration["TtsProvider"] ?? "ViXtts";
        var enableFallback = _configuration.GetValue<bool>("TtsSettings:EnableFallbackToAzure", true);

        ITtsProvider? primaryProvider = _ttsProviders.FirstOrDefault(p => p.ProviderName.Equals(preferredProviderName, StringComparison.OrdinalIgnoreCase))
                                       ?? _ttsProviders.FirstOrDefault(p => p.ProviderName.Equals("ViXtts", StringComparison.OrdinalIgnoreCase))
                                       ?? _ttsProviders.FirstOrDefault();

        if (primaryProvider == null)
        {
            throw new InvalidOperationException("Không tìm thấy bất kỳ nhà cung cấp TTS nào được đăng ký trong hệ thống.");
        }

        byte[] audioBytes;
        string usedProviderName = primaryProvider.ProviderName;
        string fileExtension = usedProviderName.Equals("ViXtts", StringComparison.OrdinalIgnoreCase) ? "wav" : "mp3";

        try
        {
            _logger.LogInformation("Đang sinh podcast với TTS Provider chính: {ProviderName}", primaryProvider.ProviderName);
            audioBytes = await primaryProvider.SynthesizeSpeechAsync(post.Message, null, ct);
        }
        catch (Exception ex) when (enableFallback && !primaryProvider.ProviderName.Equals("Azure", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(ex, "TTS Provider chính {PrimaryProvider} thất bại. Đang kích hoạt Auto-Fallback sang Azure Speech...", primaryProvider.ProviderName);

            var fallbackProvider = _ttsProviders.FirstOrDefault(p => p.ProviderName.Equals("Azure", StringComparison.OrdinalIgnoreCase));
            if (fallbackProvider == null)
            {
                throw;
            }

            audioBytes = await fallbackProvider.SynthesizeSpeechAsync(post.Message, null, ct);
            usedProviderName = fallbackProvider.ProviderName;
            fileExtension = "mp3";
        }

        // 3. Lưu tệp âm thanh vật lý
        var uniqueFileName = $"podcast-{postId}-{Guid.NewGuid().ToString()[..8]}.{fileExtension}";
        var relativePath = $"/uploads/podcasts/{uniqueFileName}";
        var absolutePath = Path.Combine(_webRootPath, "uploads", "podcasts", uniqueFileName);

        var uploadsDirectory = Path.GetDirectoryName(absolutePath);
        if (!string.IsNullOrEmpty(uploadsDirectory) && !Directory.Exists(uploadsDirectory))
        {
            Directory.CreateDirectory(uploadsDirectory);
        }

        await File.WriteAllBytesAsync(absolutePath, audioBytes, ct);

        // 4. Ước lượng độ dài âm thanh
        int wordCount = post.Message.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;
        int estimatedDuration = Math.Max(5, (int)(wordCount / 2.5));

        // 5. Lưu tập Podcast vào cơ sở dữ liệu
        var episode = new PodcastEpisode
        {
            PostId = postId,
            Title = title,
            AudioPath = relativePath,
            DurationSeconds = estimatedDuration,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.PodcastEpisodes.Add(episode);
        await _context.SaveChangesAsync(ct);
        _cache.Remove(PodcastsCacheKey);

        _logger.LogInformation("Tạo thành công podcast tập ID={EpisodeId} qua provider {UsedProvider}", episode.Id, usedProviderName);

        return new PodcastResponse(
            episode.Id,
            episode.PostId,
            episode.Title,
            episode.AudioPath,
            episode.DurationSeconds,
            episode.CreatedAt);
    }

    public async Task<bool> DeletePodcastAsync(int id, CancellationToken ct)
    {
        var episode = await _context.PodcastEpisodes.FindAsync(new object[] { id }, ct);
        if (episode == null)
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(episode.AudioPath) && episode.AudioPath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            var absolutePath = Path.Combine(_webRootPath, episode.AudioPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(absolutePath))
            {
                try
                {
                    File.Delete(absolutePath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Không thể xóa file audio tại đường dẫn {AbsolutePath}", absolutePath);
                }
            }
        }

        _context.PodcastEpisodes.Remove(episode);
        await _context.SaveChangesAsync(ct);
        _cache.Remove(PodcastsCacheKey);
        return true;
    }

    public async Task<PodcastResponse> UploadPodcastAudioAsync(int? postId, string title, Microsoft.AspNetCore.Http.IFormFile audioFile, int? durationSeconds, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Tiêu đề số phát thanh Podcast không được để trống.", nameof(title));
        }

        if (audioFile == null || audioFile.Length == 0)
        {
            throw new ArgumentException("File âm thanh không hợp lệ hoặc rỗng.", nameof(audioFile));
        }

        const long maxSizeBytes = 50 * 1024 * 1024; // 50MB
        if (audioFile.Length > maxSizeBytes)
        {
            throw new ArgumentException("Dung lượng file âm thanh vượt quá giới hạn cho phép (tối đa 50MB).", nameof(audioFile));
        }

        var ext = Path.GetExtension(audioFile.FileName).ToLowerInvariant();
        var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".mp3", ".wav", ".m4a", ".ogg", ".aac", ".webm", ".flac"
        };

        if (string.IsNullOrEmpty(ext) || !allowedExtensions.Contains(ext))
        {
            throw new ArgumentException($"Định dạng file '{ext}' không được hỗ trợ. Vui lòng tải lên file âm thanh (.mp3, .wav, .m4a, .ogg, .aac).", nameof(audioFile));
        }

        if (postId.HasValue)
        {
            var postExists = await _context.MemoryPosts.AnyAsync(p => p.Id == postId.Value, ct);
            if (!postExists)
            {
                _logger.LogWarning("Không tìm thấy bài viết ID={PostId} để liên kết podcast, tiếp tục tạo podcast độc lập.", postId.Value);
                postId = null;
            }
        }

        var podcastDir = Path.Combine(_webRootPath, "uploads", "podcasts");
        if (!Directory.Exists(podcastDir))
        {
            Directory.CreateDirectory(podcastDir);
        }

        var postPrefix = postId.HasValue ? postId.Value.ToString() : "custom";
        var uniqueFileName = $"podcast-upload-{postPrefix}-{Guid.NewGuid().ToString()[..8]}{ext}";
        var relativePath = $"/uploads/podcasts/{uniqueFileName}";
        var absolutePath = Path.Combine(podcastDir, uniqueFileName);

        await using (var fileStream = new FileStream(absolutePath, FileMode.Create))
        {
            await audioFile.CopyToAsync(fileStream, ct);
        }

        int duration = durationSeconds.GetValueOrDefault();
        if (duration <= 0)
        {
            duration = Math.Max(10, (int)(audioFile.Length / 16000));
        }

        var episode = new PodcastEpisode
        {
            PostId = postId,
            Title = title.Trim(),
            AudioPath = relativePath,
            DurationSeconds = duration,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.PodcastEpisodes.Add(episode);
        await _context.SaveChangesAsync(ct);
        _cache.Remove(PodcastsCacheKey);

        _logger.LogInformation("Tải lên thành công podcast tập ID={EpisodeId} ({Title}) đường dẫn: {AudioPath}", episode.Id, episode.Title, episode.AudioPath);

        return new PodcastResponse(
            episode.Id,
            episode.PostId,
            episode.Title,
            episode.AudioPath,
            episode.DurationSeconds,
            episode.CreatedAt);
    }
}
