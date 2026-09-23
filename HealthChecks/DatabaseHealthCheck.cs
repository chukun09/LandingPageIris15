using LandingPageEvent.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LandingPageEvent.HealthChecks;

public sealed class DatabaseHealthCheck : IHealthCheck
{
    private readonly AppDbContext _dbContext;

    public DatabaseHealthCheck(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var canConnect = await _dbContext.Database.CanConnectAsync(cancellationToken);
            if (!canConnect)
            {
                return HealthCheckResult.Unhealthy("Không thể kết nối tới cơ sở dữ liệu.");
            }

            var count = await _dbContext.MemoryPosts.CountAsync(cancellationToken);
            var provider = _dbContext.Database.ProviderName?.Split('.').LastOrDefault() ?? "Database";
            return HealthCheckResult.Healthy($"Cơ sở dữ liệu {provider} hoạt động bình thường. Tổng bài đăng: {count}.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Lỗi khi kiểm tra cơ sở dữ liệu.", ex);
        }
    }
}
