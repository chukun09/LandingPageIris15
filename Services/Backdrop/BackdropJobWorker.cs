using LandingPageEvent.Models.Backdrop;

namespace LandingPageEvent.Services.Backdrop;

/// <summary>
/// Chạy các job dựng file in tuần tự ở nền.
///
/// Trước đây việc này nằm thẳng trong request: một lệnh GET giữ luồng web suốt
/// quá trình dựng ảnh hàng trăm megabyte, và giao diện gọi đúng URL đó hai lần
/// (một cho thẻ img, một cho nút tải) nên dựng trọn vẹn hai lượt.
/// </summary>
public sealed class BackdropJobWorker(
    IBackdropJobQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<BackdropJobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Bộ dựng backdrop đã sẵn sàng.");

        while (!stoppingToken.IsCancellationRequested)
        {
            BackdropJob job;
            try
            {
                job = await queue.DequeueAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            using var scope = scopeFactory.CreateScope();
            var renderer = scope.ServiceProvider.GetRequiredService<IBackdropRenderer>();

            job.State = BackdropJobState.Running;
            job.Stage = "Đang bắt đầu";
            job.Progress = 0;

            var progress = new Progress<(double Progress, string Stage)>(p =>
            {
                job.Progress = p.Progress;
                job.Stage = p.Stage;
            });

            try
            {
                await renderer.RenderAsync(job, progress, stoppingToken);
                job.State = BackdropJobState.Completed;
                job.Progress = 1;
                job.Stage = "Hoàn tất";
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                job.State = BackdropJobState.Failed;
                job.Error = "Máy chủ đang tắt, job bị huỷ.";
                break;
            }
            catch (Exception ex)
            {
                job.State = BackdropJobState.Failed;
                job.Error = ex.Message;
                job.Stage = "Thất bại";
                logger.LogError(ex, "Dựng backdrop thất bại cho job {JobId}", job.Id);
            }
        }
    }
}
