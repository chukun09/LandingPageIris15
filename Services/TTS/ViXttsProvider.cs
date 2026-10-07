using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LandingPageEvent.Services.TTS;

public sealed class ViXttsProvider : ITtsProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ViXttsProvider> _logger;

    public string ProviderName => "ViXtts";

    public ViXttsProvider(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<ViXttsProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<byte[]> SynthesizeSpeechAsync(string text, string? voiceConfig, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ArgumentException("Nội dung văn bản không được để trống.", nameof(text));
        }

        var baseUrl = _configuration["TtsSettings:ViXtts:BaseUrl"] 
                      ?? _configuration["ViXtts:ApiUrl"] 
                      ?? "http://localhost:8000";

        var endpoint = baseUrl.EndsWith("/api/tts") ? baseUrl : $"{baseUrl.TrimEnd('/')}/api/tts";
        var speakerWav = !string.IsNullOrWhiteSpace(voiceConfig) 
            ? voiceConfig 
            : (_configuration["TtsSettings:ViXtts:SpeakerWav"] ?? "voices/default_vietnamese.wav");

        var speed = _configuration.GetValue<double>("TtsSettings:ViXtts:Speed", 1.03);
        var temperature = _configuration.GetValue<double>("TtsSettings:ViXtts:Temperature", 0.72);

        var payload = new
        {
            text = text,
            speaker_wav = speakerWav,
            language = "vi",
            speed = speed,
            temperature = temperature
        };

        _logger.LogInformation("Gửi request sinh giọng nói ViXTTS tới endpoint {Endpoint}", endpoint);

        var client = _httpClientFactory.CreateClient("ViXttsClient");
        var jsonContent = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        var apiKey = _configuration["TtsSettings:ViXtts:ApiKey"] ?? "iris-event-2026-secret-tts-key";
        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = jsonContent
        };
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            requestMessage.Headers.Add("X-API-Key", apiKey);
        }

        using var response = await client.SendAsync(requestMessage, ct);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Lỗi từ ViXTTS Microservice ({StatusCode}): {ErrorBody}", response.StatusCode, errorBody);
            throw new InvalidOperationException($"Lỗi gọi ViXTTS Microservice (HTTP {response.StatusCode}): {errorBody}");
        }

        var audioBytes = await response.Content.ReadAsByteArrayAsync(ct);
        _logger.LogInformation("Sinh giọng nói thành công qua ViXTTS. Kích thước dữ liệu: {Length} bytes", audioBytes.Length);

        return audioBytes;
    }
}
