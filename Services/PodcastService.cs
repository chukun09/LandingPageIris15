using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.CognitiveServices.Speech;
using LandingPageEvent.Data;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;

namespace LandingPageEvent.Services;

public sealed class PodcastService : IPodcastService
{
    private readonly AppDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly string _webRootPath;

    public PodcastService(AppDbContext context, IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
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

        // Lấy cấu hình Azure Speech từ tham số truyền vào hoặc file appsettings.json
        var speechKey = !string.IsNullOrWhiteSpace(apiKey) ? apiKey : _configuration["AzureSpeech:ApiKey"];
        var speechRegion = !string.IsNullOrWhiteSpace(region) ? region : (_configuration["AzureSpeech:Region"] ?? "southeastasia");
        var voiceName = _configuration["AzureSpeech:VoiceName"] ?? "vi-VN-HoaiMyNeural"; // HoaiMyNeural (nữ miền Nam), NamMinhNeural (nam miền Bắc)

        if (string.IsNullOrWhiteSpace(speechKey))
        {
            throw new InvalidOperationException("Chưa cấu hình API Key cho Azure Speech Service.");
        }

        // 2. Chuẩn bị gọi Azure Text-to-Speech bằng SDK
        var speechConfig = SpeechConfig.FromSubscription(speechKey, speechRegion);
        speechConfig.SpeechSynthesisVoiceName = voiceName;
        speechConfig.SetSpeechSynthesisOutputFormat(SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3);

        // Mã hóa ký tự đặc biệt trong tin nhắn để chèn vào SSML an toàn
        var encodedText = System.Net.WebUtility.HtmlEncode(post.Message);

        var ssml = $"""
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>
            <voice name='{voiceName}'>
                <prosody rate="0.95">
                    {encodedText}
                </prosody>
            </voice>
        </speak>
        """;

        byte[] audioBytes;
        using (var synthesizer = new SpeechSynthesizer(speechConfig, audioConfig: null))
        {
            using var result = await synthesizer.SpeakSsmlAsync(ssml).ConfigureAwait(false);

            if (result.Reason == ResultReason.SynthesizingAudioCompleted)
            {
                audioBytes = result.AudioData;
            }
            else if (result.Reason == ResultReason.Canceled)
            {
                var cancellation = SpeechSynthesisCancellationDetails.FromResult(result);
                throw new InvalidOperationException($"Lỗi gọi Azure Speech SDK (Bị hủy): {cancellation.Reason}. Chi tiết: {cancellation.ErrorDetails}");
            }
            else
            {
                throw new InvalidOperationException($"Lỗi gọi Azure Speech SDK: {result.Reason}");
            }
        }
        var uniqueFileName = $"podcast-{postId}-{Guid.NewGuid().ToString().Substring(0, 8)}.mp3";
        var relativePath = $"/uploads/podcasts/{uniqueFileName}";
        var absolutePath = Path.Combine(_webRootPath, "uploads", "podcasts", uniqueFileName);

        await File.WriteAllBytesAsync(absolutePath, audioBytes, ct);

        // Ước lượng độ dài âm thanh (khoảng 3 từ/giây cho tiếng Việt tốc độ trung bình)
        // Để chuyên nghiệp hơn, ta ước tính sơ bộ từ số lượng từ:
        int wordCount = post.Message.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;
        int estimatedDuration = Math.Max(5, (int)(wordCount / 2.5)); // Trung bình 2.5 từ/giây

        // 4. Lưu tập Podcast vào cơ sở dữ liệu
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

        // Xóa file vật lý nếu là file cục bộ của hệ thống
        if (!string.IsNullOrWhiteSpace(episode.AudioPath) && episode.AudioPath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            var absolutePath = Path.Combine(_webRootPath, episode.AudioPath.TrimStart('/'));
            if (File.Exists(absolutePath))
            {
                try
                {
                    File.Delete(absolutePath);
                }
                catch
                {
                    // Bỏ qua lỗi xóa file để đảm bảo xóa thành công trong DB
                }
            }
        }

        _context.PodcastEpisodes.Remove(episode);
        await _context.SaveChangesAsync(ct);
        return true;
    }
}
