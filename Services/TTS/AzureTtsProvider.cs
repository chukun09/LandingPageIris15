using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.CognitiveServices.Speech;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LandingPageEvent.Services.TTS;

public sealed class AzureTtsProvider : ITtsProvider
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<AzureTtsProvider> _logger;

    public string ProviderName => "Azure";

    public AzureTtsProvider(IConfiguration configuration, ILogger<AzureTtsProvider> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<byte[]> SynthesizeSpeechAsync(string text, string? voiceConfig, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ArgumentException("Nội dung văn bản không được để trống.", nameof(text));
        }

        var speechKey = _configuration["TtsSettings:Azure:ApiKey"] 
                        ?? _configuration["AzureSpeech:ApiKey"];
        var speechRegion = _configuration["TtsSettings:Azure:Region"] 
                          ?? (_configuration["AzureSpeech:Region"] ?? "southeastasia");
        var voiceName = !string.IsNullOrWhiteSpace(voiceConfig)
            ? voiceConfig
            : (_configuration["TtsSettings:Azure:VoiceName"] ?? _configuration["AzureSpeech:VoiceName"] ?? "vi-VN-HoaiMyNeural");

        if (string.IsNullOrWhiteSpace(speechKey) || speechKey == "YOUR_AZURE_SPEECH_KEY_HERE")
        {
            throw new InvalidOperationException("Chưa cấu hình Azure Speech ApiKey hợp lệ.");
        }

        _logger.LogInformation("Gửi request sinh giọng nói Azure Speech API ({VoiceName}, {Region})", voiceName, speechRegion);

        var speechConfig = SpeechConfig.FromSubscription(speechKey, speechRegion);
        speechConfig.SpeechSynthesisVoiceName = voiceName;
        speechConfig.SetSpeechSynthesisOutputFormat(SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3);

        var encodedText = WebUtility.HtmlEncode(text);
        var ssml = $"""
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>
            <voice name='{voiceName}'>
                <prosody rate="0.95">
                    {encodedText}
                </prosody>
            </voice>
        </speak>
        """;

        using var synthesizer = new SpeechSynthesizer(speechConfig, audioConfig: null);
        using var result = await synthesizer.SpeakSsmlAsync(ssml).ConfigureAwait(false);

        if (result.Reason == ResultReason.SynthesizingAudioCompleted)
        {
            _logger.LogInformation("Sinh giọng nói thành công qua Azure Speech API. Kích thước: {Length} bytes", result.AudioData.Length);
            return result.AudioData;
        }

        if (result.Reason == ResultReason.Canceled)
        {
            var cancellation = SpeechSynthesisCancellationDetails.FromResult(result);
            _logger.LogError("Lỗi gọi Azure Speech SDK (Bị hủy): {Reason}. Chi tiết: {ErrorDetails}", cancellation.Reason, cancellation.ErrorDetails);
            throw new InvalidOperationException($"Lỗi gọi Azure Speech SDK (Bị hủy): {cancellation.Reason}. Chi tiết: {cancellation.ErrorDetails}");
        }

        throw new InvalidOperationException($"Lỗi gọi Azure Speech SDK: {result.Reason}");
    }
}
