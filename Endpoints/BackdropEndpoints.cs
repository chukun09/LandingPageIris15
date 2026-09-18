using LandingPageEvent.Configuration;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models.Backdrop;
using LandingPageEvent.Services;
using LandingPageEvent.Services.Backdrop;
using LandingPageEvent.Services.Mosaic;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace LandingPageEvent.Endpoints;

/// <summary>
/// Dựng và tải file in backdrop.
///
/// Thay cho endpoint cũ `GET /api/admin/backdrop`, vốn dựng ảnh ngay trong
/// request và bị giao diện gọi hai lần cho mỗi lần xem.
/// </summary>
public static class BackdropEndpoints
{
    public static void MapBackdropEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/backdrop").WithTags("Backdrop");

        // ── Ước lượng trước khi dựng ────────────────────────────────────────
        group.MapGet("/preflight", async Task<Ok<BackdropPreflightResponse>> (
            IBackdropRenderer renderer,
            IOptions<BackdropOptions> options,
            [AsParameters] BackdropSpecQuery query,
            CancellationToken ct) =>
        {
            var spec = query.ToSpec(options.Value);
            var pre = await renderer.PreflightAsync(spec, ct);

            return TypedResults.Ok(new BackdropPreflightResponse(
                PhotoCount: pre.PhotoCount,
                MinPhotos: pre.MinPhotos,
                TrimWidthMm: spec.TrimWidthMm,
                TrimHeightMm: spec.TrimHeightMm,
                EffectiveDpi: spec.EffectiveDpi,
                MetadataDpi: pre.MetadataDpi,
                CanvasWidthPx: pre.CanvasWidthPx,
                CanvasHeightPx: pre.CanvasHeightPx,
                Megapixels: pre.Megapixels,
                EstimatedPeakMb: pre.EstimatedPeakBytes / 1024 / 1024,
                ExceedsMemoryCap: pre.ExceedsMemoryCap,
                LargestTileEdgePx: pre.LargestTileEdgePx,
                Format: spec.Format.ToString(),
                Theme: spec.Theme.ToString(),
                LowResolutionPhotos: pre.LowResolutionPhotos
                    .Select(w => new BackdropWarningDto(w.PostId, w.SourceShortEdgePx, w.RequiredPx))
                    .ToList()));
        })
        .WithName("BackdropPreflight")
        .WithSummary("Ước lượng file in trước khi dựng")
        .WithDescription("Trả về kích thước pixel, bộ nhớ ước tính và danh sách ảnh không đủ nét cho ô được gán.");

        // ── Đặt job dựng ────────────────────────────────────────────────────
        group.MapPost("/jobs", async Task<Results<Accepted<BackdropJobResponse>, Ok<BackdropJobResponse>, ProblemHttpResult>> (
            IBackdropJobQueue queue,
            IPostService postService,
            IMosaicLayoutService layoutService,
            IOptions<BackdropOptions> options,
            [AsParameters] BackdropSpecQuery query,
            CancellationToken ct) =>
        {
            var spec = query.ToSpec(options.Value);
            var posts = await postService.GetMosaicPostRefsAsync(ct);
            var layout = layoutService.Build(posts);
            var specHash = spec.Hash();

            // Cùng bố cục + cùng thông số thì trả lại kết quả cũ, không dựng lại.
            if (queue.TryGetCompleted(layout.LayoutId, specHash, out var cached))
                return TypedResults.Ok(ToResponse(cached));

            var job = new BackdropJob
            {
                Id = Guid.NewGuid(),
                Spec = spec,
                LayoutId = layout.LayoutId,
                PhotoCount = layout.PhotoCount,
            };

            queue.Register(job, specHash);
            await queue.EnqueueAsync(job, ct);

            return TypedResults.Accepted($"/api/backdrop/jobs/{job.Id}", ToResponse(job));
        })
        .WithName("CreateBackdropJob")
        .WithSummary("Đặt yêu cầu dựng file in")
        .WithDescription("Trả 202 kèm jobId; nếu đã có file khớp bố cục và thông số thì trả 200 ngay.");

        // ── Trạng thái job ──────────────────────────────────────────────────
        group.MapGet("/jobs/{id:guid}", Results<Ok<BackdropJobResponse>, NotFound> (
            Guid id, IBackdropJobQueue queue) =>
            queue.TryGet(id, out var job)
                ? TypedResults.Ok(ToResponse(job))
                : TypedResults.NotFound())
        .WithName("GetBackdropJob")
        .WithSummary("Tiến độ dựng file in");

        // ── Ảnh xem trước ───────────────────────────────────────────────────
        group.MapGet("/jobs/{id:guid}/preview", Results<PhysicalFileHttpResult, NotFound> (
            Guid id, IBackdropJobQueue queue) =>
        {
            if (!queue.TryGet(id, out var job) || job.PreviewPath is null || !File.Exists(job.PreviewPath))
                return TypedResults.NotFound();

            return TypedResults.PhysicalFile(job.PreviewPath, "image/jpeg", enableRangeProcessing: true);
        })
        .WithName("GetBackdropPreview")
        .WithSummary("Ảnh xem trước nhẹ của file in")
        .WithDescription("Ảnh JPEG cạnh dài 2500px để hiển thị trên web, không phải file in hàng trăm MB.");

        // ── Tải file in ─────────────────────────────────────────────────────
        group.MapGet("/jobs/{id:guid}/download", Results<PhysicalFileHttpResult, NotFound> (
            Guid id, IBackdropJobQueue queue) =>
        {
            if (!queue.TryGet(id, out var job) || job.FilePath is null || !File.Exists(job.FilePath))
                return TypedResults.NotFound();

            var contentType = job.Spec.Format switch
            {
                BackdropFormat.Tiff => "image/tiff",
                BackdropFormat.Png => "image/png",
                _ => "image/jpeg",
            };

            // PhysicalFile phát trực tiếp từ đĩa và hỗ trợ Range, nên tải lại
            // được khi wifi hội trường rớt giữa chừng.
            return TypedResults.PhysicalFile(
                job.FilePath, contentType,
                fileDownloadName: Path.GetFileName(job.FilePath),
                enableRangeProcessing: true);
        })
        .WithName("DownloadBackdrop")
        .WithSummary("Tải file in");
    }

    private static BackdropJobResponse ToResponse(BackdropJob job) => new(
        JobId: job.Id,
        State: job.State.ToString(),
        Progress: Math.Round(job.Progress, 3),
        Stage: job.Stage,
        Error: job.Error,
        PhotoCount: job.PhotoCount,
        FileName: job.FilePath is null ? null : Path.GetFileName(job.FilePath),
        FileBytes: job.FileBytes,
        CanvasWidthPx: job.Spec.CanvasWidthPx,
        CanvasHeightPx: job.Spec.CanvasHeightPx,
        Theme: job.Spec.Theme.ToString(),
        PreviewUrl: job.PreviewPath is null ? null : $"/api/backdrop/jobs/{job.Id}/preview",
        DownloadUrl: job.FilePath is null ? null : $"/api/backdrop/jobs/{job.Id}/download",
        Warnings: job.Warnings
            .Select(w => new BackdropWarningDto(w.PostId, w.SourceShortEdgePx, w.RequiredPx))
            .ToList());
}

/// <summary>Tham số khổ in trên query string; bỏ trống thì lấy theo cấu hình máy chủ.</summary>
public sealed class BackdropSpecQuery
{
    [FromQuery] public int? WidthMm { get; set; }
    [FromQuery] public int? HeightMm { get; set; }
    [FromQuery] public int? Dpi { get; set; }
    [FromQuery] public int? Scale { get; set; }
    [FromQuery] public string? Format { get; set; }
    [FromQuery] public string? Tint { get; set; }

    /// <summary>dark | light — nền của bản in.</summary>
    [FromQuery] public string? Theme { get; set; }

    public BackdropSpec ToSpec(BackdropOptions o)
    {
        var format = Enum.TryParse<BackdropFormat>(Format, ignoreCase: true, out var f) ? f : o.Format;
        var tint = Enum.TryParse<TintMode>(Tint, ignoreCase: true, out var t) ? t : o.Tint;
        var theme = Enum.TryParse<BackdropTheme>(Theme, ignoreCase: true, out var th) ? th : o.Theme;

        return new BackdropSpec(
            TrimWidthMm: Math.Clamp(WidthMm ?? o.TrimWidthMm, 500, 20000),
            TrimHeightMm: Math.Clamp(HeightMm ?? o.TrimHeightMm, 500, 20000),
            BleedMm: o.BleedMm,
            SafeMarginMm: o.SafeMarginMm,
            EffectiveDpi: Math.Clamp(Dpi ?? o.EffectiveDpi, 20, 300),
            ScaleDenominator: Math.Clamp(Scale ?? o.ScaleDenominator, 1, 20),
            Format: format,
            JpegQuality: o.JpegQuality,
            Tint: tint,
            Theme: theme);
    }
}
