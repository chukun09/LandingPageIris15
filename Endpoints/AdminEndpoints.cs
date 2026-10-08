using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;
using LandingPageEvent.Services;
using LandingPageEvent.Services.Auth;

namespace LandingPageEvent.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/admin")
            .WithTags("Admin Panel Operations");

        // 0. Xác thực đăng nhập Ban Tổ Chức (Public)
        group.MapPost("/auth/login", (
            [FromBody] AdminLoginRequest request,
            IAdminTokenService tokenService) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Password) || !tokenService.ValidatePassword(request.Password))
            {
                return Results.Json(new { error = "Mật khẩu quản trị không chính xác!" }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var token = tokenService.GenerateToken();
            return Results.Ok(new { success = true, token });
        })
        .WithName("AdminLogin")
        .WithSummary("Đăng nhập xác thực ban tổ chức")
        .WithDescription("Xác thực mật khẩu quản trị và cấp token HMAC-SHA256 có thời hạn 7 ngày.");

        // Nhóm các Endpoint yêu cầu quyền Admin (Protected by AdminAuthFilter)
        var protectedGroup = group.MapGroup("")
            .AddEndpointFilter<AdminAuthFilter>();

        // 1. Lấy danh sách các bài viết chờ duyệt
        protectedGroup.MapGet("/posts/pending", async Task<Ok<IReadOnlyList<MemoryPost>>> (
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
        protectedGroup.MapPost("/posts/{id:int}/approve", async Task<Results<Ok<string>, NotFound>> (
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

        // 2b. Ghim hoặc bỏ ghim bài viết lên đầu
        protectedGroup.MapPost("/posts/{id:int}/pin", async Task<Results<Ok<string>, NotFound>> (
            int id,
            [FromBody] PinPostRequest? request,
            IPostService postService,
            CancellationToken ct) =>
        {
            var success = await postService.TogglePinPostAsync(id, request?.IsPinned, ct);
            if (!success)
            {
                return TypedResults.NotFound();
            }
            return TypedResults.Ok($"Cập nhật trạng thái ghim cho bài viết ID {id} thành công.");
        })
        .WithName("TogglePinPost")
        .WithSummary("Ghim hoặc bỏ ghim bài viết lên đầu")
        .WithDescription("Ghim bài viết để luôn ưu tiên hiển thị ở đầu danh sách ký ức.");

        // 2c. Duyệt toàn bộ bài viết đang chờ
        protectedGroup.MapPost("/posts/approve-all", async Task<Ok<ApproveAllResponse>> (
            IPostService postService,
            CancellationToken ct) =>
        {
            var count = await postService.ApproveAllPendingPostsAsync(ct);
            return TypedResults.Ok(new ApproveAllResponse(count, $"Đã duyệt toàn bộ {count} bài viết thành công."));
        })
        .WithName("ApproveAllPendingPosts")
        .WithSummary("Duyệt toàn bộ bài viết đang chờ")
        .WithDescription("Chuyển trạng thái IsApproved = true cho toàn bộ bài viết chưa được duyệt trong một thao tác duy nhất.");

        // 3. Chuyển đổi bài viết đã duyệt thành Podcast AI
        protectedGroup.MapPost("/posts/{id:int}/podcast", async Task<Results<Ok<PodcastResponse>, BadRequest<string>, NotFound>> (
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
        protectedGroup.MapPost("/podcasts/upload", async Task<Results<Ok<PodcastResponse>, BadRequest<string>>> (
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
                return TypedResults.BadRequest($"Lỗi khi tải lên Podcast: {ex.Message}");
            }
        })
        .DisableAntiforgery()
        .WithName("UploadPodcastAudio")
        .WithSummary("Tải lên tệp âm thanh Podcast thủ công")
        .WithDescription("Hỗ trợ tải lên file âm thanh MP3/WAV/M4A/AAC/OGG cho số phát thanh Radio IRIS 15.");

        // 5. Xóa Podcast đã tạo
        protectedGroup.MapDelete("/podcasts/{id:int}", async Task<Results<Ok<string>, NotFound>> (
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

        // 6. Warm-up Modal ViXTTS Container
        protectedGroup.MapPost("/tts/warmup", async Task<Results<Ok<object>, ProblemHttpResult>> (
            IHttpClientFactory httpClientFactory,
            Microsoft.Extensions.Configuration.IConfiguration configuration,
            CancellationToken ct) =>
        {
            var baseUrl = configuration["TtsSettings:ViXtts:BaseUrl"] 
                          ?? configuration["ViXtts:ApiUrl"] 
                          ?? "http://localhost:8000";

            var healthUrl = baseUrl.TrimEnd('/') + "/healthz";
            var apiKey = configuration["TtsSettings:ViXtts:ApiKey"];

            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                var client = httpClientFactory.CreateClient("ViXttsClient");
                using var request = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get, healthUrl);
                if (!string.IsNullOrWhiteSpace(apiKey))
                {
                    request.Headers.Add("X-API-Key", apiKey);
                }

                using var response = await client.SendAsync(request, ct);
                sw.Stop();

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync(ct);
                    return TypedResults.Ok<object>(new
                    {
                        success = true,
                        ready = true,
                        durationMs = sw.ElapsedMilliseconds,
                        message = $"GPU Container ViXTTS đã sẵn sàng (phản hồi trong {sw.ElapsedMilliseconds / 1000.0:F1}s).",
                        detail = content
                    });
                }

                return TypedResults.Problem(
                    detail: $"Modal container phản hồi HTTP {(int)response.StatusCode}: {response.ReasonPhrase}",
                    statusCode: StatusCodes.Status502BadGateway);
            }
            catch (System.Exception ex)
            {
                sw.Stop();
                return TypedResults.Problem(
                    detail: $"Khởi động container Modal thất bại sau {sw.ElapsedMilliseconds / 1000.0:F1}s: {ex.Message}",
                    statusCode: StatusCodes.Status504GatewayTimeout);
            }
        })
        .WithName("WarmupViXtts")
        .WithSummary("Khởi động Container Modal ViXTTS")
        .WithDescription("Gửi request tới /healthz của Modal để đánh thức GPU container từ trạng thái ngủ, tránh timeout 60s khi tạo podcast.");

        // 7. Bố cục và Xuất bản Khảm 3D (Mosaic)
        protectedGroup.MapGet("/mosaic/state", async Task<Ok<LandingPageEvent.Services.Mosaic.MosaicPublishStateDto>> (
            LandingPageEvent.Services.Mosaic.IMosaicPublishService publishService,
            CancellationToken ct) =>
        {
            var state = await publishService.GetStateAsync(ct);
            return TypedResults.Ok(state);
        })
        .WithName("GetMosaicPublishState")
        .WithSummary("Lấy trạng thái và cấu hình sắp xếp Mosaic")
        .WithDescription("Trả về thông tin vị trí các ảnh trên chữ IRIS 15 và trạng thái xuất bản.");

        protectedGroup.MapPost("/mosaic/publish", async Task<Results<Ok<LandingPageEvent.Services.Mosaic.MosaicPublishStateDto>, BadRequest<string>>> (
            [FromBody] PublishMosaicRequest request,
            LandingPageEvent.Services.Mosaic.IMosaicPublishService publishService,
            CancellationToken ct) =>
        {
            if (request.OrderedPostIds == null || request.OrderedPostIds.Count == 0)
            {
                return TypedResults.BadRequest("Danh sách thứ tự bài viết không được để trống.");
            }

            var state = await publishService.PublishAsync(request.OrderedPostIds, ct);
            return TypedResults.Ok(state);
        })
        .WithName("PublishMosaic")
        .WithSummary("Lưu và xuất bản Bố cục Mosaic")
        .WithDescription("Sinh file Atlas WebP tĩnh chất lượng cao từ ảnh Preview 1600px và lưu trữ vĩnh viễn trên R2.");

        protectedGroup.MapPost("/mosaic/reset-default", async Task<Ok<LandingPageEvent.Services.Mosaic.MosaicPublishStateDto>> (
            LandingPageEvent.Services.Mosaic.IMosaicPublishService publishService,
            CancellationToken ct) =>
        {
            var state = await publishService.ResetToDefaultAsync(ct);
            return TypedResults.Ok(state);
        })
        .WithName("ResetMosaicDefault")
        .WithSummary("Khôi phục Bố cục Mosaic về tự động")
        .WithDescription("Xoá cấu hình tuỳ chỉnh và tính lại thứ tự theo số lượt bình chọn.");
    }
}

/// <summary>
/// Bộ lọc kiểm tra phiên đăng nhập ban tổ chức.
/// </summary>
public sealed class AdminAuthFilter(IAdminTokenService tokenService) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var authHeader = context.HttpContext.Request.Headers["Authorization"].FirstOrDefault();
        string? token = null;

        if (!string.IsNullOrWhiteSpace(authHeader) && authHeader.StartsWith("Bearer ", System.StringComparison.OrdinalIgnoreCase))
        {
            token = authHeader["Bearer ".Length..].Trim();
        }
        else
        {
            token = context.HttpContext.Request.Headers["X-Admin-Token"].FirstOrDefault();
        }

        if (!tokenService.ValidateToken(token))
        {
            return Results.Json(
                new { error = "Unauthorized: Phiên đăng nhập ban tổ chức không hợp lệ hoặc đã hết hạn." },
                statusCode: StatusCodes.Status401Unauthorized);
        }

        return await next(context);
    }
}

/// <summary>
/// Yêu cầu đăng nhập quản trị.
/// </summary>
public sealed record AdminLoginRequest(string Password);

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

/// <summary>
/// Yêu cầu ghim hoặc bỏ ghim bài viết.
/// </summary>
public sealed record PinPostRequest(bool? IsPinned);

/// <summary>
/// Kết quả duyệt toàn bộ bài viết.
/// </summary>
public sealed record ApproveAllResponse(int Count, string Message);

/// <summary>
/// Yêu cầu xuất bản bố cục Mosaic.
/// </summary>
public sealed record PublishMosaicRequest(List<int> OrderedPostIds);
