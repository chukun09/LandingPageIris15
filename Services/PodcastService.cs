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
    private readonly Storage.IStorageService? _storageService;
    private readonly string _webRootPath;

    private const string PodcastsCacheKey = "PodcastService_Podcasts";
    private static readonly SemaphoreSlim _podcastLock = new(1, 1);

    public PodcastService(
        AppDbContext context,
        IEnumerable<ITtsProvider> ttsProviders,
        IConfiguration configuration,
        ILogger<PodcastService> logger,
        IMemoryCache? cache = null,
        Storage.IStorageService? storageService = null)
    {
        _context = context;
        _ttsProviders = ttsProviders;
        _configuration = configuration;
        _logger = logger;
        _cache = cache ?? new MemoryCache(new MemoryCacheOptions());
        _storageService = storageService;
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

            cached = await _context.PodcastEpisodes
                .AsNoTracking()
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new PodcastResponse(
                    p.Id,
                    p.PostId,
                    p.Title,
                    p.AudioPath,
                    p.DurationSeconds,
                    p.CreatedAt))
                .ToListAsync(ct);

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
        // 1. Tìm bài đăng gốc và kiểm tra điều kiện tạo Podcast
        var post = await _context.MemoryPosts.FindAsync(new object[] { postId }, ct);
        if (post == null)
        {
            throw new KeyNotFoundException($"Không tìm thấy bài viết với ID = {postId}");
        }

        if (!post.IsApproved)
        {
            throw new InvalidOperationException("Chỉ những bài viết đã được duyệt mới có thể tạo Podcast/Radio.");
        }

        var existingPodcast = await _context.PodcastEpisodes.AnyAsync(p => p.PostId == postId, ct);
        if (existingPodcast)
        {
            throw new InvalidOperationException("Bài viết này đã có tập Podcast/Radio. Không thể tạo mới.");
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
        var relativePath = $"uploads/podcasts/{uniqueFileName}";
        var mimeType = fileExtension == "mp3" ? "audio/mpeg" : "audio/wav";

        string audioPath;
        if (_storageService != null)
        {
            using var audioStream = new MemoryStream(audioBytes);
            audioPath = await _storageService.SaveFileAsync(audioStream, relativePath, mimeType, ct);
        }
        else
        {
            var absolutePath = Path.Combine(_webRootPath, "uploads", "podcasts", uniqueFileName);
            var uploadsDirectory = Path.GetDirectoryName(absolutePath);
            if (!string.IsNullOrEmpty(uploadsDirectory) && !Directory.Exists(uploadsDirectory))
            {
                Directory.CreateDirectory(uploadsDirectory);
            }
            await File.WriteAllBytesAsync(absolutePath, audioBytes, ct);
            audioPath = $"/{relativePath}";
        }

        // 4. Tính toán thời lượng âm thanh chuẩn xác từ header file WAV hoặc fallback
        int estimatedDuration = CalculateAudioDurationSeconds(audioBytes, fileExtension, post.Message);

        // 5. Lưu tập Podcast vào cơ sở dữ liệu
        var episode = new PodcastEpisode
        {
            PostId = postId,
            Title = title,
            AudioPath = audioPath,
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

        if (!string.IsNullOrWhiteSpace(episode.AudioPath))
        {
            if (_storageService != null)
            {
                await _storageService.DeleteFileAsync(episode.AudioPath, ct);
            }
            else if (episode.AudioPath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
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
            var post = await _context.MemoryPosts.FindAsync(new object[] { postId.Value }, ct);
            if (post == null)
            {
                throw new KeyNotFoundException($"Không tìm thấy bài viết ID = {postId.Value}");
            }
            if (!post.IsApproved)
            {
                throw new InvalidOperationException("Chỉ những bài viết đã được duyệt mới có thể liên kết Podcast/Radio.");
            }
            var hasExisting = await _context.PodcastEpisodes.AnyAsync(p => p.PostId == postId.Value, ct);
            if (hasExisting)
            {
                throw new InvalidOperationException("Bài viết này đã có tập Podcast/Radio, không thể tạo thêm.");
            }
        }

        var postPrefix = postId.HasValue ? postId.Value.ToString() : "custom";
        var uniqueFileName = $"podcast-upload-{postPrefix}-{Guid.NewGuid().ToString()[..8]}{ext}";
        var relativePath = $"uploads/podcasts/{uniqueFileName}";
        var mimeType = ext == ".mp3" ? "audio/mpeg" : "audio/wav";

        string audioUrl;
        if (_storageService != null)
        {
            await using var uploadStream = audioFile.OpenReadStream();
            audioUrl = await _storageService.SaveFileAsync(uploadStream, relativePath, mimeType, ct);
        }
        else
        {
            var podcastDir = Path.Combine(_webRootPath, "uploads", "podcasts");
            if (!Directory.Exists(podcastDir))
            {
                Directory.CreateDirectory(podcastDir);
            }
            var absolutePath = Path.Combine(podcastDir, uniqueFileName);
            await using (var fileStream = new FileStream(absolutePath, FileMode.Create))
            {
                await audioFile.CopyToAsync(fileStream, ct);
            }
            audioUrl = $"/{relativePath}";
        }

        int duration = durationSeconds.GetValueOrDefault();
        if (duration <= 0)
        {
            if (ext.Equals(".wav", StringComparison.OrdinalIgnoreCase) && audioFile.Length >= 44)
            {
                try
                {
                    using var headerStream = audioFile.OpenReadStream();
                    var headerBytes = new byte[Math.Min(4096, (int)audioFile.Length)];
                    int read = headerStream.Read(headerBytes, 0, headerBytes.Length);
                    duration = CalculateAudioDurationSeconds(headerBytes, "wav", string.Empty);
                }
                catch
                {
                    // Fallback
                }
            }
            if (duration <= 0)
            {
                duration = Math.Max(5, (int)(audioFile.Length / 16000));
            }
        }

        var episode = new PodcastEpisode
        {
            PostId = postId,
            Title = title.Trim(),
            AudioPath = audioUrl,
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

    private static int CalculateAudioDurationSeconds(byte[] audioBytes, string fileExtension, string fallbackText)
    {
        if (audioBytes == null || audioBytes.Length == 0) return 5;

        if (fileExtension.Equals("wav", StringComparison.OrdinalIgnoreCase) && audioBytes.Length >= 44)
        {
            try
            {
                // RIFF WAVE header check
                if (audioBytes[0] == 'R' && audioBytes[1] == 'I' && audioBytes[2] == 'F' && audioBytes[3] == 'F' &&
                    audioBytes[8] == 'W' && audioBytes[9] == 'A' && audioBytes[10] == 'V' && audioBytes[11] == 'E')
                {
                    int byteRate = BitConverter.ToInt32(audioBytes, 28);
                    if (byteRate > 0)
                    {
                        int dataSize = audioBytes.Length - 44;
                        for (int i = 12; i < audioBytes.Length - 8; i++)
                        {
                            if (audioBytes[i] == 'd' && audioBytes[i + 1] == 'a' && audioBytes[i + 2] == 't' && audioBytes[i + 3] == 'a')
                            {
                                dataSize = BitConverter.ToInt32(audioBytes, i + 4);
                                break;
                            }
                        }
                        if (dataSize > 0)
                        {
                            double seconds = (double)dataSize / byteRate;
                            return Math.Max(1, (int)Math.Round(seconds));
                        }
                    }
                }
            }
            catch
            {
                // Fallback
            }
        }

        int wordCount = fallbackText.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Max(5, (int)(wordCount / 2.5));
    }
}
