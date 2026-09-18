using System.Threading;
using System.Threading.Tasks;

namespace LandingPageEvent.Services.TTS;

public interface ITtsProvider
{
    /// <summary>
    /// Tên đại diện cho nhà cung cấp TTS (Ví dụ: "ViXtts", "Azure")
    /// </summary>
    string ProviderName { get; }

    /// <summary>
    /// Thực hiện chuyển đổi văn bản thành dữ liệu mảng byte âm thanh (.wav hoặc .mp3)
    /// </summary>
    /// <param name="text">Nội dung câu nói cần đọc</param>
    /// <param name="voiceConfig">Cấu hình giọng đọc (tùy chọn)</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Mảng byte chứa dữ liệu tệp âm thanh</returns>
    Task<byte[]> SynthesizeSpeechAsync(string text, string? voiceConfig, CancellationToken ct);
}
