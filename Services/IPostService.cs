using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;
using LandingPageEvent.Models.Mosaic;

namespace LandingPageEvent.Services;

public interface IPostService
{
    /// <summary>
    /// Dữ liệu tối thiểu mà bộ sinh bố cục khảm cần: id, số phiếu, thời điểm gửi.
    /// Tách riêng khỏi <see cref="GetApprovedPostsAsync"/> vì bố cục không cần
    /// đường dẫn ảnh và phải ổn định trước khi ảnh được tải xong.
    /// </summary>
    Task<IReadOnlyList<MosaicPostRef>> GetMosaicPostRefsAsync(CancellationToken ct);

    /// <summary>Đường dẫn web tới ảnh thu nhỏ của từng bài đã duyệt, tra theo Id.</summary>
    Task<IReadOnlyDictionary<int, string>> GetThumbnailPathsAsync(CancellationToken ct);

    /// <summary>Đường dẫn web tới ảnh GỐC của từng bài đã duyệt — chỉ dùng cho bản in.</summary>
    Task<IReadOnlyDictionary<int, string>> GetOriginalPathsAsync(CancellationToken ct);

    Task<PostResponse> CreatePostAsync(CreatePostRequest request, Stream imageStream, string fileName, CancellationToken ct);
    Task ProcessQueuedUploadAsync(UploadWorkItem item, CancellationToken ct);
    Task<IReadOnlyList<PostResponse>> GetApprovedPostsAsync(CancellationToken ct);
    Task<IReadOnlyList<MemoryPost>> GetPendingPostsAsync(CancellationToken ct);
    Task<bool> ApprovePostAsync(int id, bool approve, CancellationToken ct);
    Task<bool> VotePostAsync(int id, CancellationToken ct);
    // GenerateBackdropAsync đã được gỡ: việc dựng file in chuyển sang
    // Services/Backdrop/BackdropRenderer.cs, chạy ở nền qua hàng đợi job.
}
