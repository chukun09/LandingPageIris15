using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;

namespace LandingPageEvent.Services;

public interface IPostService
{
    Task<PostResponse> CreatePostAsync(CreatePostRequest request, Stream imageStream, string fileName, CancellationToken ct);
    Task ProcessQueuedUploadAsync(UploadWorkItem item, CancellationToken ct);
    Task<IReadOnlyList<PostResponse>> GetApprovedPostsAsync(CancellationToken ct);
    Task<IReadOnlyList<MemoryPost>> GetPendingPostsAsync(CancellationToken ct);
    Task<bool> ApprovePostAsync(int id, bool approve, CancellationToken ct);
    Task<bool> VotePostAsync(int id, CancellationToken ct);
    Task<byte[]> GenerateBackdropAsync(CancellationToken ct);
}
