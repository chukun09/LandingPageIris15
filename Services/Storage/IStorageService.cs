using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace LandingPageEvent.Services.Storage;

public interface IStorageService
{
    /// <summary>
    /// Lưu trữ file (lên Cloudflare R2 hoặc Local storage tùy cấu hình).
    /// </summary>
    /// <param name="stream">Luồng dữ liệu của file</param>
    /// <param name="relativePath">Đường dẫn tương đối (ví dụ: uploads/original/abc.jpg hoặc uploads/podcasts/xyz.wav)</param>
    /// <param name="contentType">MIME type (ví dụ: image/jpeg, audio/wav)</param>
    /// <param name="ct">CancellationToken</param>
    /// <returns>URL hoặc đường dẫn tương đối truy cập file</returns>
    Task<string> SaveFileAsync(Stream stream, string relativePath, string contentType, CancellationToken ct);

    /// <summary>
    /// Xóa file khỏi kho lưu trữ.
    /// </summary>
    /// <param name="fileUrlOrPath">URL hoặc đường dẫn của file</param>
    /// <param name="ct">CancellationToken</param>
    /// <returns>True nếu xóa thành công hoặc file không tồn tại</returns>
    Task<bool> DeleteFileAsync(string fileUrlOrPath, CancellationToken ct);
}
