using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace LandingPageEvent.Services;

public sealed class UploadQueue : IUploadQueue
{
    private readonly Channel<UploadWorkItem> _channel;

    public UploadQueue()
    {
        // BoundedChannel để giới hạn tối đa 1000 phần tử trong hàng đợi để tránh tràn bộ nhớ
        var options = new BoundedChannelOptions(1000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true, // Chỉ có 1 Background Worker xử lý tuần tự để tránh lock SQLite
            SingleWriter = false // Nhiều API Thread có thể ghi vào hàng đợi cùng lúc
        };
        _channel = Channel.CreateBounded<UploadWorkItem>(options);
    }

    public async ValueTask QueueWorkItemAsync(UploadWorkItem workItem)
    {
        await _channel.Writer.WriteAsync(workItem);
    }

    public async ValueTask<UploadWorkItem> DequeueWorkItemAsync(CancellationToken cancellationToken)
    {
        return await _channel.Reader.ReadAsync(cancellationToken);
    }
}
