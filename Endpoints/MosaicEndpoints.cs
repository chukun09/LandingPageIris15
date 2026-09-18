using LandingPageEvent.Configuration;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models.Mosaic;
using LandingPageEvent.Services;
using LandingPageEvent.Services.Mosaic;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace LandingPageEvent.Endpoints;

/// <summary>
/// Bố cục khảm — nguồn chuẩn duy nhất dùng chung cho khung 3D trên web và cho
/// file in backdrop. Trước đây mặt nạ chữ bị chép hai bản (frontend và backend)
/// và đã lệch nhau, khiến hai bên hiển thị hai chữ khác nhau.
/// </summary>
public static class MosaicEndpoints
{
    public static void MapMosaicEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/mosaic").WithTags("Mosaic");

        group.MapGet("/layout", async Task<Results<Ok<MosaicLayoutResponse>, StatusCodeHttpResult, ProblemHttpResult>> (
            HttpContext http,
            IPostService postService,
            IMosaicLayoutService layoutService,
            [FromQuery] string? mode,
            CancellationToken ct) =>
        {
            MosaicLayoutMode? requested = null;
            if (!string.IsNullOrWhiteSpace(mode))
            {
                if (!Enum.TryParse<MosaicLayoutMode>(mode, ignoreCase: true, out var parsed))
                {
                    return TypedResults.Problem(
                        detail: $"Bố cục '{mode}' không hợp lệ. Chọn: inline, stacked, digitsOnly.",
                        statusCode: StatusCodes.Status400BadRequest);
                }
                requested = parsed;
            }

            var posts = await postService.GetMosaicPostRefsAsync(ct);
            var layout = layoutService.Build(posts, requested);

            // layoutId đã băm toàn bộ tham số + danh sách ảnh, nên dùng thẳng làm ETag.
            var etag = $"\"{layout.LayoutId}\"";
            var requestETags = http.Request.GetTypedHeaders().IfNoneMatch;
            if (requestETags.Any(t => t.Tag.ToString() == etag))
                return TypedResults.StatusCode(StatusCodes.Status304NotModified);

            http.Response.Headers.ETag = etag;
            http.Response.Headers.CacheControl = "public, max-age=0, must-revalidate";

            return TypedResults.Ok(ToResponse(layout));
        })
        .WithName("GetMosaicLayout")
        .WithSummary("Bố cục khảm IRIS 15")
        .WithDescription("Trả về danh sách ô ảnh: mỗi ảnh đã duyệt chiếm đúng một ô, không lặp, không ô trống.");

        group.MapGet("/atlas", async Task<Results<FileContentHttpResult, StatusCodeHttpResult, ProblemHttpResult>> (
            HttpContext http,
            IMosaicAtlasService atlasService,
            [FromQuery] int? tile,
            CancellationToken ct) =>
        {
            MosaicAtlas atlas;
            try
            {
                atlas = await atlasService.GetAsync(tile ?? 128, ct);
            }
            catch (ArgumentException ex)
            {
                return TypedResults.Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest);
            }

            var requestETags = http.Request.GetTypedHeaders().IfNoneMatch;
            if (requestETags.Any(t => t.Tag.ToString() == atlas.ETag))
                return TypedResults.StatusCode(StatusCodes.Status304NotModified);

            http.Response.Headers.ETag = atlas.ETag;
            // Nội dung đã được băm vào ETag; trình duyệt vẫn phải hỏi lại vì URL
            // không mang mã băm, nhưng 304 chỉ tốn vài chục byte.
            http.Response.Headers.CacheControl = "public, max-age=0, must-revalidate";
            http.Response.Headers["X-Atlas-Tile"] = atlas.TileSize.ToString();
            http.Response.Headers["X-Atlas-Grid"] = $"{atlas.Columns}x{atlas.Rows}";
            http.Response.Headers["X-Atlas-Count"] = atlas.PhotoCount.ToString();

            return TypedResults.File(atlas.Bytes, atlas.ContentType);
        })
        .WithName("GetMosaicAtlas")
        .WithSummary("Sprite atlas của toàn bộ ảnh đã duyệt")
        .WithDescription("Một ảnh duy nhất chứa mọi ảnh, xếp theo đúng thứ hạng của bố cục: ô rank thứ n lấy ô atlas thứ n.");

        group.MapGet("/capacity", async Task<Ok<MosaicCapacityResponse>> (
            IPostService postService,
            IMosaicLayoutService layoutService,
            [FromQuery] string? mode,
            CancellationToken ct) =>
        {
            MosaicLayoutMode? requested =
                Enum.TryParse<MosaicLayoutMode>(mode, ignoreCase: true, out var parsed) ? parsed : null;

            var (min, max) = layoutService.Capacity(requested);
            var posts = await postService.GetMosaicPostRefsAsync(ct);

            return TypedResults.Ok(new MosaicCapacityResponse(
                Mode: (requested ?? MosaicLayoutMode.Inline).ToString(),
                MinPhotos: min,
                MaxPhotosAtBaseLattice: max,
                CurrentPhotoCount: posts.Count));
        })
        .WithName("GetMosaicCapacity")
        .WithSummary("Sức chứa của bố cục khảm")
        .WithDescription("Số ảnh tối thiểu để vẽ được chữ và số ô tối đa ở lưới gốc.");
    }

    private static MosaicLayoutResponse ToResponse(MosaicLayout layout)
    {
        double cols = layout.Lattice.Cols;
        double rows = layout.Lattice.Rows;

        var tiles = new List<MosaicTileDto>(layout.Tiles.Count);
        foreach (var t in layout.Tiles)
        {
            tiles.Add(new MosaicTileDto(
                Index: t.Index,
                U: [t.Unit.X, t.Unit.Y, t.Unit.W, t.Unit.H],
                R:
                [
                    Round(t.Unit.X / cols),
                    Round(t.Unit.Y / cols),
                    Round(t.Unit.W / cols),
                    Round(t.Unit.H / cols),
                ],
                LetterId: t.LetterId,
                PostId: t.PostId,
                Rank: t.Rank));
        }

        return new MosaicLayoutResponse(
            LayoutId: layout.LayoutId,
            GlyphVersion: layout.GlyphVersion,
            Mode: layout.Mode,
            PhotoCount: layout.PhotoCount,
            TileCount: layout.Tiles.Count,
            EmptyTileCount: layout.EmptyTileCount,
            MinTilesForShape: layout.MinTilesForShape,
            Lattice: new MosaicLatticeDto(layout.Lattice.UnitsPerCap, layout.Lattice.Rows, layout.Lattice.Cols),
            ViewBox: [1.0, Round(rows / cols)],
            Letters: layout.Letters
                .Select(l => new MosaicLetterDto(l.Id, l.Char, l.TintRole, l.PrintHex, l.Order))
                .ToList(),
            Tiles: tiles);
    }

    // Cắt bớt chữ số thừa: 6 chữ số thập phân là dư thừa cho toạ độ world.
    private static double Round(double v) => Math.Round(v, 6);
}
