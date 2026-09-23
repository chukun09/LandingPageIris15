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

        // 4. Tải lên tệp âm thanh Podcast thủ công (.mp3, .wav, .m4a, .ogg, .aac, .webm)
        group.MapPost("/podcasts/upload", async Task<Results<Ok<PodcastResponse>, BadRequest<string>>> (
            IFormFile file,
            [FromForm] string title,
            [FromForm] int? postId,
            [FromForm] int? durationSeconds,
            IPodcastService podcastService,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(title))
            {
                return TypedResults.BadRequest("Tiêu đề số phát thanh Podcast không được để trống.");
            }

            if (file == null || file.Length == 0)
            {
                return TypedResults.BadRequest("Vui lòng chọn tệp âm thanh hợp lệ.");
            }

            try
            {
                var response = await podcastService.UploadPodcastAudioAsync(
                    postId,
                    title,
                    file,
                    durationSeconds,
                    ct);

                return TypedResults.Ok(response);
            }
            catch (System.ArgumentException ex)
            {
                return TypedResults.BadRequest(ex.Message);
            }
            catch (System.Exception ex)
            {
                return TypedResults.BadRequest($"Lỗi khi tải lên file âm thanh: {ex.Message}");
            }
        })
        .DisableAntiforgery()
        .WithName("UploadPodcastAudio")
        .WithSummary("Tải lên file Podcast thủ công")
        .WithDescription("Cho phép Ban tổ chức tải lên trực tiếp file âm thanh (.mp3, .wav, .m4a, .aac) tự chuẩn bị hoặc sinh trước ở local.");

        // 5. Endpoint xuất backdrop cũ đã chuyển sang /api/backdrop/*.
        //    Bản cũ dựng ảnh ngay trong request và bị giao diện gọi hai lần cho
        //    mỗi lần xem, nên dựng trọn vẹn hai lượt.
        group.MapGet("/backdrop", () => TypedResults.Redirect("/api/backdrop/preflight", permanent: true))
        .WithName("ExportBackdropLegacy")
        .WithSummary("Đã chuyển sang /api/backdrop")
        .WithDescription("Giữ lại để đường dẫn cũ không gãy; luồng mới đặt job qua POST /api/backdrop/jobs.");

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
