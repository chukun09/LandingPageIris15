using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
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
    private readonly string _webRootPath;

    public PodcastService(
        AppDbContext context,
        IEnumerable<ITtsProvider> ttsProviders,
        IConfiguration configuration,
        ILogger<PodcastService> logger)
    {
        _context = context;
        _ttsProviders = ttsProviders;
        _configuration = configuration;
        _logger = logger;
        _webRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    }

    public async Task<IReadOnlyList<PodcastResponse>> GetPodcastsAsync(CancellationToken ct)
    {
        var episodes = await _context.PodcastEpisodes
            .AsNoTracking()
            .ToListAsync(ct);

        return episodes
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new PodcastResponse(
                p.Id,
                p.PostId,
                p.Title,
                p.AudioPath,
                p.DurationSeconds,
                p.CreatedAt))
            .ToList();
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
        return true;
    }
}
