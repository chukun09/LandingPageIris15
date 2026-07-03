using System.Threading;
using System.Threading.Tasks;

namespace LandingPageEvent.Services;

public sealed record UploadWorkItem(
    string Message,
    string? Department,
    string TempFilePath,
    string OriginalFileName);

public interface IUploadQueue
{
    ValueTask QueueWorkItemAsync(UploadWorkItem workItem);
    ValueTask<UploadWorkItem> DequeueWorkItemAsync(CancellationToken cancellationToken);
}
