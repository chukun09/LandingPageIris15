using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using LandingPageEvent.DTOs;
using LandingPageEvent.Services;

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
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                return TypedResults.BadRequest("Nội dung lời chúc không được để trống.");
            }

            if (file == null || file.Length == 0)
            {
                return TypedResults.BadRequest("Hình ảnh kỷ niệm là bắt buộc.");
            }

            var extension = Path.GetExtension(file.FileName).ToLower();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp", ".svg" };
            if (!System.Array.Exists(allowedExtensions, ext => ext == extension))
            {
                return TypedResults.BadRequest("Định dạng ảnh không hợp lệ. Chỉ chấp nhận .jpg, .jpeg, .png, .webp, .svg");
            }

            // Lưu nhanh vào thư mục tạm
            var tempFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "temp");
            Directory.CreateDirectory(tempFolder);
            var tempFilePath = Path.Combine(tempFolder, $"temp-{Guid.NewGuid()}{extension}");

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
        .WithDescription("Ảnh upload sẽ được tự động lưu trữ và nén tạo thumbnail, chờ ban tổ chức duyệt.");

        // 2. Lấy danh sách ảnh đã duyệt hiển thị trên Bức tường ký ức
        group.MapGet("/", async Task<Ok<IReadOnlyList<PostResponse>>> (
            IPostService postService,
            CancellationToken ct) =>
        {
            var posts = await postService.GetApprovedPostsAsync(ct);
            return TypedResults.Ok(posts);
        })
        .WithName("GetApprovedPosts")
        .WithSummary("Lấy danh sách các bài viết đã duyệt")
        .WithDescription("Danh sách bài đăng hiển thị trên Bức tường ký ức.");

        // 3. CBNV thả tim bình chọn bài viết
        group.MapPost("/{id:int}/vote", async Task<Results<Ok<string>, NotFound>> (
            int id,
            IPostService postService,
            CancellationToken ct) =>
        {
            var success = await postService.VotePostAsync(id, ct);
            if (!success)
            {
                return TypedResults.NotFound();
            }
            return TypedResults.Ok("Thả tim thành công!");
        })
        .WithName("VotePost")
        .WithSummary("Thả tim bài viết")
        .WithDescription("Cộng 1 điểm bình chọn cho bài viết.");
    }
}
