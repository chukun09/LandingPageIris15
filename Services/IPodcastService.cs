using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;

namespace LandingPageEvent.Services;

public interface IPodcastService
{
    Task<IReadOnlyList<PodcastResponse>> GetPodcastsAsync(CancellationToken ct);
    Task<PodcastResponse> GeneratePodcastAsync(int postId, string title, string? apiKey, string? region, CancellationToken ct);
    Task<bool> DeletePodcastAsync(int id, CancellationToken ct);
}
