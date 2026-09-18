using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LandingPageEvent.HealthChecks;

public sealed class ViXttsHealthCheck : IHealthCheck
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;

    public ViXttsHealthCheck(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var baseUrl = _configuration["TtsSettings:ViXtts:BaseUrl"] 
                      ?? _configuration["ViXtts:ApiUrl"] 
                      ?? "http://localhost:8000";

        var healthEndpoint = $"{baseUrl.TrimEnd('/')}/healthz";

        try
        {
            var client = _httpClientFactory.CreateClient("ViXttsClient");
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

            var response = await client.GetAsync(healthEndpoint, linkedCts.Token);
            if (response.IsSuccessStatusCode)
            {
                return HealthCheckResult.Healthy($"ViXTTS Microservice phản hồi tốt tại '{healthEndpoint}'.");
            }

            return HealthCheckResult.Degraded($"ViXTTS Microservice trả về mã HTTP {response.StatusCode}. Tính năng phát thanh Radio có thể suy giảm.");
        }
        catch (Exception ex)
        {
            // ViXTTS là phụ thuộc tùy chọn (có thể fallback sang Azure hoặc không bật),
            // nên không đánh dấu cả ứng dụng web Unhealthy.
            return HealthCheckResult.Degraded($"Không thể kết nối tới ViXTTS Microservice tại '{healthEndpoint}'. Lỗi: {ex.Message}");
        }
    }
}
