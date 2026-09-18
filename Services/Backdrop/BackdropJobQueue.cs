using System.Collections.Concurrent;
using System.Threading.Channels;
using LandingPageEvent.Models.Backdrop;

namespace LandingPageEvent.Services.Backdrop;

public interface IBackdropJobQueue
{
    /// <summary>Đưa một yêu cầu dựng file in vào hàng đợi.</summary>
    ValueTask EnqueueAsync(BackdropJob job, CancellationToken ct = default);

    ValueTask<BackdropJob> DequeueAsync(CancellationToken ct);

    bool TryGet(Guid id, out BackdropJob job);

    /// <summary>Job đã hoàn tất gần nhất cho một cặp (bố cục, thông số) — dùng làm cache.</summary>
    bool TryGetCompleted(string layoutId, string specHash, out BackdropJob job);

    void Register(BackdropJob job, string specHash);

    IReadOnlyList<BackdropJob> Recent(int take);
}

/// <summary>
/// Hàng đợi dựng file in, đồng thời đúng MỘT job.
///
/// Giới hạn 1 không phải vì đơn giản mà vì bộ nhớ: mỗi job giữ một khung ảnh
/// hàng trăm megabyte, hai job song song là cách chắc chắn nhất để tiến trình
/// bị hệ điều hành giết giữa sự kiện.
/// </summary>
public sealed class BackdropJobQueue : IBackdropJobQueue
{
    private readonly Channel<BackdropJob> _channel =
        Channel.CreateBounded<BackdropJob>(new BoundedChannelOptions(16)
        {
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait,
        });

    private readonly ConcurrentDictionary<Guid, BackdropJob> _jobs = new();
    private readonly ConcurrentDictionary<string, Guid> _byCacheKey = new();
    private readonly ConcurrentQueue<Guid> _order = new();

    public ValueTask EnqueueAsync(BackdropJob job, CancellationToken ct = default) =>
        _channel.Writer.WriteAsync(job, ct);

    public ValueTask<BackdropJob> DequeueAsync(CancellationToken ct) =>
        _channel.Reader.ReadAsync(ct);

    public bool TryGet(Guid id, out BackdropJob job) => _jobs.TryGetValue(id, out job!);

    public bool TryGetCompleted(string layoutId, string specHash, out BackdropJob job)
    {
        job = null!;
        if (!_byCacheKey.TryGetValue(CacheKey(layoutId, specHash), out var id)) return false;
        if (!_jobs.TryGetValue(id, out var found)) return false;
        if (found.State != BackdropJobState.Completed) return false;
        // File có thể đã bị dọn thủ công trên đĩa.
        if (found.FilePath is null || !File.Exists(found.FilePath)) return false;

        job = found;
        return true;
    }

    public void Register(BackdropJob job, string specHash)
    {
        _jobs[job.Id] = job;
        _byCacheKey[CacheKey(job.LayoutId, specHash)] = job.Id;
        _order.Enqueue(job.Id);

        // Giữ lịch sử gọn: bỏ bản ghi cũ nhất, không xoá file trên đĩa.
        while (_order.Count > 40 && _order.TryDequeue(out var old))
        {
            if (old != job.Id) _jobs.TryRemove(old, out _);
        }
    }

    public IReadOnlyList<BackdropJob> Recent(int take) =>
        _jobs.Values.OrderByDescending(j => j.Id).Take(take).ToList();

    private static string CacheKey(string layoutId, string specHash) => $"{layoutId}:{specHash}";
}
