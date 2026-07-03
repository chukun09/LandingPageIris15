using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;
using LandingPageEvent.Services;

namespace LandingPageEvent.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/admin")
            .WithTags("Admin Panel Operations");

        // 1. Lấy danh sách các bài viết chờ duyệt
        group.MapGet("/posts/pending", async Task<Ok<IReadOnlyList<MemoryPost>>> (
            IPostService postService,
            CancellationToken ct) =>
        {
            var pending = await postService.GetPendingPostsAsync(ct);
            return TypedResults.Ok(pending);
        })
        .WithName("GetPendingPosts")
        .WithSummary("Lấy danh sách các bài đăng chưa duyệt")
        .WithDescription("Dành cho ban tổ chức kiểm duyệt nội dung.");

        // 2. Duyệt hoặc xóa bài viết
        group.MapPost("/posts/{id:int}/approve", async Task<Results<Ok<string>, NotFound>> (
            int id,
            [FromBody] ApprovePostRequest request,
            IPostService postService,
            CancellationToken ct) =>
        {
            var success = await postService.ApprovePostAsync(id, request.Approve, ct);
            if (!success)
            {
                return TypedResults.NotFound();
            }
            var status = request.Approve ? "đã duyệt hiển thị" : "đã từ chối và xóa";
            return TypedResults.Ok($"Bài viết ID {id} {status} thành công.");
        })
        .WithName("ApprovePost")
        .WithSummary("Duyệt hoặc từ chối bài viết")
        .WithDescription("Nếu duyệt = true, bài viết xuất hiện trên Mosaic. Nếu duyệt = false, xóa bài viết khỏi CSDL và file vật lý.");

        // 3. Chuyển đổi bài viết đã duyệt thành Podcast AI
        group.MapPost("/posts/{id:int}/podcast", async Task<Results<Ok<PodcastResponse>, BadRequest<string>, NotFound>> (
            int id,
            [FromBody] GeneratePodcastRequest request,
            IPodcastService podcastService,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                return TypedResults.BadRequest("Tiêu đề số phát thanh Podcast không được để trống.");
            }

            try
            {
                var response = await podcastService.GeneratePodcastAsync(
                    id,
                    request.Title,
                    request.ApiKey,
                    request.Region,
                    ct);

                return TypedResults.Ok(response);
            }
            catch (System.Collections.Generic.KeyNotFoundException)
            {
                return TypedResults.NotFound();
            }
            catch (System.Exception ex)
            {
                return TypedResults.BadRequest($"Lỗi khi tạo Podcast AI: {ex.Message}");
            }
        })
        .WithName("GeneratePodcast")
        .WithSummary("Tạo Podcast AI từ bài viết")
        .WithDescription("Gọi dịch vụ Azure Text-to-Speech API để chuyển đổi nội dung lời chúc thành file audio phát thanh.");

        // 4. Xuất file ảnh in ấn Backdrop check-in độ phân giải cao
        group.MapGet("/backdrop", async Task<FileContentHttpResult> (
            IPostService postService,
            CancellationToken ct) =>
        {
            var backdropBytes = await postService.GenerateBackdropAsync(ct);
            return TypedResults.File(backdropBytes, "image/png", $"IRIS15_Backdrop_{System.DateTime.UtcNow:yyyyMMdd_HHmmss}.png");
        })
        .WithName("ExportBackdrop")
        .WithSummary("Xuất file in Backdrop check-in sự kiện")
        .WithDescription("Ghép các ảnh gốc đã duyệt vào chữ IRIS 15 ở độ phân giải in ấn 300 DPI và tải xuống.");

        // 5. Xóa Podcast đã tạo
        group.MapDelete("/podcasts/{id:int}", async Task<Results<Ok<string>, NotFound>> (
            int id,
            IPodcastService podcastService,
            CancellationToken ct) =>
        {
            var success = await podcastService.DeletePodcastAsync(id, ct);
            if (!success)
            {
                return TypedResults.NotFound();
            }
            return TypedResults.Ok($"Đã xóa số phát thanh Podcast ID {id} thành công.");
        })
        .WithName("DeletePodcast")
        .WithSummary("Xóa Podcast đã tạo")
        .WithDescription("Xóa Podcast khỏi cơ sở dữ liệu SQLite và tệp âm thanh vật lý trên đĩa.");
    }
}

/// <summary>
/// Yêu cầu duyệt bài viết.
/// </summary>
public sealed record ApprovePostRequest(bool Approve);

/// <summary>
/// Yêu cầu tạo Podcast AI.
/// </summary>
public sealed record GeneratePodcastRequest(
    string Title,
    string? ApiKey,
    string? Region);
