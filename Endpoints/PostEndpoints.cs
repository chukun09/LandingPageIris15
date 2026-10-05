using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using LandingPageEvent.DTOs;
using LandingPageEvent.Services;
using LandingPageEvent.Services.Imaging;

namespace LandingPageEvent.Endpoints;

public static class PostEndpoints
{
    public static void MapPostEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/posts")
            .WithTags("Memory Wall");

        // 1. Nhân viên gửi ảnh và lời chúc ẩn danh
        group.MapPost("/", async Task<Results<Accepted<string>, BadRequest<string>>> (
            [FromForm] string message,
            [FromForm] string? department,
            IFormFile file,
            IUploadQueue uploadQueue,
            IImagePolicy imagePolicy,
            HttpContext httpContext,
            IMemoryCache cache,
            CancellationToken ct) =>
        {
            // Kiểm tra Rate Limit theo IP: tối đa 5 lượt gửi trong 5 phút
            var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var forwarded = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(forwarded))
            {
                clientIp = forwarded.Split(',')[0].Trim();
            }

            var uploadRateKey = $"rate_upload_{clientIp}";
            if (cache.TryGetValue(uploadRateKey, out int currentUploads) && currentUploads >= 5)
            {
                return TypedResults.BadRequest("Bạn đã gửi bài quá nhiều lần liên tiếp. Vui lòng chờ 5 phút trước khi gửi bài tiếp theo.");
            }
            cache.Set(uploadRateKey, currentUploads + 1, System.TimeSpan.FromMinutes(5));

            if (string.IsNullOrWhiteSpace(message))
            {
                return TypedResults.BadRequest("Nội dung lời chúc không được để trống.");
            }

            if (file == null || file.Length == 0)
            {
                return TypedResults.BadRequest("Hình ảnh kỷ niệm là bắt buộc.");
            }

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!imagePolicy.AllowedExtensions.Contains(extension))
            {
                return TypedResults.BadRequest(
                    "Định dạng ảnh không hợp lệ. Chỉ chấp nhận " +
                    string.Join(", ", imagePolicy.AllowedExtensions.Order()));
            }

            // Đuôi file chỉ là gợi ý — kiểm tra nội dung thật trước khi ghi ra đĩa,
            // để file giả định dạng không bao giờ chạm tới bộ giải mã ảnh.
            await using (var probe = file.OpenReadStream())
            {
                var check = await imagePolicy.ValidateAsync(probe, ct);
                if (!check.Ok)
                {
                    return TypedResults.BadRequest(check.Error!);
                }
            }

            // Lưu nhanh vào thư mục tạm
            var tempFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "temp");
            Directory.CreateDirectory(tempFolder);
            var tempFilePath = Path.Combine(tempFolder, $"temp-{System.Guid.NewGuid()}{extension}");

            using (var fileStream = new FileStream(tempFilePath, FileMode.Create))
            {
                await file.CopyToAsync(fileStream, ct);
            }

            // Đưa vào hàng đợi xử lý ngầm tuần tự
            var workItem = new UploadWorkItem(message, department, tempFilePath, file.FileName);
            await uploadQueue.QueueWorkItemAsync(workItem);

            return TypedResults.Accepted($"/api/admin/posts/pending", "Kỷ niệm của bạn đã được tiếp nhận và xếp hàng xử lý.");
        })
        .DisableAntiforgery() // Tắt CSRF token check cho việc upload file đơn giản trên intranet
        .WithName("UploadPost")
        .WithSummary("CBNV upload hình ảnh và lời chúc ẩn danh")
        .WithDescription("Ảnh được kiểm tra định dạng thật theo nội dung file, sau đó lưu trữ và tạo thumbnail, chờ ban tổ chức duyệt.");

        // 2. Lấy danh sách ảnh đã duyệt hiển thị trên Bức tường ký ức
        group.MapGet("/", async Task<Ok<IReadOnlyList<PostResponse>>> (
            HttpContext httpContext,
            IPostService postService,
            CancellationToken ct) =>
        {
            var posts = await postService.GetApprovedPostsAsync(ct);
            httpContext.Response.Headers.CacheControl = "public, max-age=5, stale-while-revalidate=10";
            return TypedResults.Ok(posts);
        })
        .WithName("GetApprovedPosts")
        .WithSummary("Lấy danh sách các bài viết đã duyệt")
        .WithDescription("Danh sách bài đăng hiển thị trên Bức tường ký ức.");

        // 3. CBNV thả tim bình chọn bài viết (Anti-Cheat Vote Guard)
        group.MapPost("/{id:int}/vote", async Task<Results<Ok<string>, BadRequest<string>, NotFound>> (
            int id,
            HttpContext httpContext,
            IMemoryCache cache,
            IPostService postService,
            CancellationToken ct) =>
        {
            var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var forwarded = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(forwarded))
            {
                clientIp = forwarded.Split(',')[0].Trim();
            }

            // 1. Chống script lặp request nhanh (Tối đa 1 vote / 1 giây trên mỗi IP)
            var spamKey = $"rate_vote_speed_{clientIp}";
            if (cache.TryGetValue(spamKey, out _))
            {
                return TypedResults.BadRequest("Thao tác quá nhanh. Vui lòng thử lại sau giây lát.");
            }
            cache.Set(spamKey, true, System.TimeSpan.FromSeconds(1));

            // 2. Chống buff tim trùng lặp (1 IP/thiết bị chỉ được vote 1 lần / bài viết trong 24 giờ)
            var voteCookieKey = $"voted_post_{id}";
            var hasCookie = httpContext.Request.Cookies.ContainsKey(voteCookieKey);
            var ipVoteKey = $"voted_ip_{clientIp}_{id}";
            var hasIpVoted = cache.TryGetValue(ipVoteKey, out _);

            if (hasCookie || hasIpVoted)
            {
                return TypedResults.BadRequest("Bạn đã thả tim cho kỷ niệm này rồi!");
            }

            var success = await postService.VotePostAsync(id, ct);
            if (!success)
            {
                return TypedResults.NotFound();
            }

            var isHttps = httpContext.Request.IsHttps 
                || string.Equals(httpContext.Request.Headers["X-Forwarded-Proto"], "https", System.StringComparison.OrdinalIgnoreCase);

            cache.Set(ipVoteKey, true, System.TimeSpan.FromHours(24));
            httpContext.Response.Cookies.Append(voteCookieKey, "1", new CookieOptions
            {
                Expires = System.DateTimeOffset.UtcNow.AddHours(24),
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                Secure = isHttps
            });

            return TypedResults.Ok("Thả tim thành công!");
        })
        .WithName("VotePost")
        .WithSummary("Thả tim bài viết")
        .WithDescription("Cộng 1 điểm bình chọn cho bài viết (Có bảo vệ chống buff tim ảo).");
    }
}
