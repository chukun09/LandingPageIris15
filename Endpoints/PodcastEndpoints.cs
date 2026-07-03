using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Services;

namespace LandingPageEvent.Endpoints;

public static class PodcastEndpoints
{
    public static void MapPodcastEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/podcasts")
            .WithTags("AI Podcast");

        // 1. Lấy danh sách các số phát sóng Podcast hàng ngày
        group.MapGet("/", async Task<Ok<IReadOnlyList<PodcastResponse>>> (
            IPodcastService podcastService,
            CancellationToken ct) =>
        {
            var podcasts = await podcastService.GetPodcastsAsync(ct);
            return TypedResults.Ok(podcasts);
        })
        .WithName("GetPodcasts")
        .WithSummary("Lấy danh sách các số Podcast đã phát hành")
        .WithDescription("Danh sách Podcast phát thanh hàng ngày hiển thị cho nhân viên nghe.");
    }
}
