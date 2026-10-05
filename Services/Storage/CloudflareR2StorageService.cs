using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LandingPageEvent.Services.Storage;

public sealed class CloudflareR2StorageService : IStorageService, IDisposable
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<CloudflareR2StorageService> _logger;
    private readonly string _webRootPath;
    private readonly IAmazonS3? _s3Client;
    private readonly string _bucketName;
    private readonly string _publicUrl;
    private readonly bool _isR2Configured;

    public CloudflareR2StorageService(
        IConfiguration configuration,
        ILogger<CloudflareR2StorageService> logger)
    {
        _configuration = configuration;
        _logger = logger;
        _webRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

        var accountId = _configuration["R2Settings:AccountId"];
        var accessKeyId = _configuration["R2Settings:AccessKeyId"];
        var secretAccessKey = _configuration["R2Settings:SecretAccessKey"];
        _bucketName = _configuration["R2Settings:BucketName"] ?? "landingpage-event";
        _publicUrl = (_configuration["R2Settings:PublicUrl"] ?? string.Empty).TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(accountId) 
            && !string.IsNullOrWhiteSpace(accessKeyId) 
            && !string.IsNullOrWhiteSpace(secretAccessKey)
            && !accountId.Contains("YOUR_"))
        {
            var s3Config = new AmazonS3Config
            {
                ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com",
                ForcePathStyle = true
            };
            var credentials = new BasicAWSCredentials(accessKeyId, secretAccessKey);
            _s3Client = new AmazonS3Client(credentials, s3Config);
            _isR2Configured = true;
            _logger.LogInformation("Khởi tạo Cloudflare R2 Storage thành công cho Bucket '{BucketName}'", _bucketName);
        }
        else
        {
            _s3Client = null;
            _isR2Configured = false;
            _logger.LogInformation("R2Settings chưa được cấu hình. Sử dụng Local Storage tại {WebRootPath}", _webRootPath);
        }
    }

    public async Task<string> SaveFileAsync(Stream stream, string relativePath, string contentType, CancellationToken ct)
    {
        if (stream == null)
        {
            throw new ArgumentNullException(nameof(stream));
        }

        var normalizedKey = relativePath.Replace('\\', '/').TrimStart('/');

        // 1. Luôn lưu một bản sao cục bộ để ImagePolicy, Backdrop service hoặc Local cache đọc được
        try
        {
            var localPath = Path.Combine(_webRootPath, normalizedKey.Replace('/', Path.DirectorySeparatorChar));
            var localDir = Path.GetDirectoryName(localPath);
            if (!string.IsNullOrWhiteSpace(localDir) && !Directory.Exists(localDir))
            {
                Directory.CreateDirectory(localDir);
            }

            if (stream.CanSeek)
            {
                stream.Position = 0;
            }

            using var localFileStream = new FileStream(localPath, FileMode.Create, FileAccess.Write, FileShare.None);
            await stream.CopyToAsync(localFileStream, ct);

            if (stream.CanSeek)
            {
                stream.Position = 0;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không thể lưu bản sao cục bộ cho file {Key}", normalizedKey);
        }

        // 2. Nếu cấu hình Cloudflare R2, đẩy file lên Cloudflare R2 Bucket
        if (_isR2Configured && _s3Client != null)
        {
            try
            {
                if (stream.CanSeek)
                {
                    stream.Position = 0;
                }

                var putRequest = new PutObjectRequest
                {
                    BucketName = _bucketName,
                    Key = normalizedKey,
                    InputStream = stream,
                    ContentType = contentType,
                    DisablePayloadSigning = true
                };

                await _s3Client.PutObjectAsync(putRequest, ct);
                _logger.LogInformation("Đã tải file lên Cloudflare R2 thành công: {Key}", normalizedKey);

                // Trả về Public URL nếu có, nếu không trả về dạng CDN R2
                return !string.IsNullOrWhiteSpace(_publicUrl) 
                    ? $"{_publicUrl}/{normalizedKey}" 
                    : $"/{normalizedKey}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi tải file lên Cloudflare R2 cho key {Key}. Fallback sang đường dẫn cục bộ.", normalizedKey);
            }
        }

        // Fallback đường dẫn cục bộ
        return $"/{normalizedKey}";
    }

    public async Task<bool> DeleteFileAsync(string fileUrlOrPath, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(fileUrlOrPath))
        {
            return true;
        }

        // Trích xuất relative key từ URL hoặc path
        var normalizedKey = fileUrlOrPath;
        if (!string.IsNullOrWhiteSpace(_publicUrl) && normalizedKey.StartsWith(_publicUrl, StringComparison.OrdinalIgnoreCase))
        {
            normalizedKey = normalizedKey.Substring(_publicUrl.Length).TrimStart('/');
        }
        else if (normalizedKey.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || normalizedKey.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(fileUrlOrPath, UriKind.Absolute, out var uri))
            {
                normalizedKey = uri.AbsolutePath.TrimStart('/');
            }
        }
        else
        {
            normalizedKey = normalizedKey.TrimStart('/').Replace('\\', '/');
        }

        var deleted = false;

        // Xóa trên Cloudflare R2 nếu có
        if (_isR2Configured && _s3Client != null)
        {
            try
            {
                var deleteRequest = new DeleteObjectRequest
                {
                    BucketName = _bucketName,
                    Key = normalizedKey
                };
                await _s3Client.DeleteObjectAsync(deleteRequest, ct);
                deleted = true;
                _logger.LogInformation("Đã xóa file trên Cloudflare R2: {Key}", normalizedKey);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi xóa file trên Cloudflare R2: {Key}", normalizedKey);
            }
        }

        // Xóa file cục bộ
        try
        {
            var localPath = Path.Combine(_webRootPath, normalizedKey.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(localPath))
            {
                File.Delete(localPath);
                deleted = true;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Lỗi xóa file cục bộ: {Path}", normalizedKey);
        }

        return deleted;
    }

    public void Dispose()
    {
        _s3Client?.Dispose();
    }
}
