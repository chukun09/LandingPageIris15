using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LandingPageEvent.Services;

public sealed class UploadBackgroundWorker : BackgroundService
{
    private readonly IUploadQueue _queue;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<UploadBackgroundWorker> _logger;

    public UploadBackgroundWorker(
        IUploadQueue queue,
        IServiceProvider serviceProvider,
        ILogger<UploadBackgroundWorker> logger)
    {
        _queue = queue;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Background Upload Worker đã khởi động.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Lấy công việc từ hàng đợi (chờ nếu hàng đợi rỗng)
                var workItem = await _queue.DequeueWorkItemAsync(stoppingToken);

                _logger.LogInformation("Đang xử lý ảnh upload cho bài đăng từ phòng ban: {Dept}", workItem.Department ?? "Ẩn danh");

                // Tạo scope để resolve Scoped Services (DbContext, PostService)
                using (var scope = _serviceProvider.CreateScope())
                {
                    var postService = scope.ServiceProvider.GetRequiredService<IPostService>();
                    await postService.ProcessQueuedUploadAsync(workItem, stoppingToken);
                }

                _logger.LogInformation("Xử lý ảnh và lưu database hoàn tất.");
            }
            catch (OperationCanceledException)
            {
                // Ứng dụng đang dừng
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi xảy ra khi xử lý ảnh upload trong Background Worker.");
            }
        }

        _logger.LogInformation("Background Upload Worker đã dừng.");
    }
}
