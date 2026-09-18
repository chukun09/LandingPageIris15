using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LandingPageEvent.HealthChecks;

public sealed class StorageHealthCheck : IHealthCheck
{
    private readonly IWebHostEnvironment _environment;

    public StorageHealthCheck(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var uploadsDir = Path.Combine(webRoot, "uploads");

            if (!Directory.Exists(uploadsDir))
            {
                Directory.CreateDirectory(uploadsDir);
            }

            // Thử tạo và xóa một file probe kiểm tra quyền ghi thực tế
            var testFilePath = Path.Combine(uploadsDir, $".health_probe_{Guid.NewGuid():N}.tmp");
            File.WriteAllText(testFilePath, "ok");
            File.Delete(testFilePath);

            return Task.FromResult(HealthCheckResult.Healthy($"Thư mục lưu trữ '{uploadsDir}' có đầy đủ quyền đọc/ghi."));
        }
        catch (Exception ex)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy("Lỗi quyền ghi hoặc không thể truy cập thư mục lưu trữ uploads.", ex));
        }
    }
}
