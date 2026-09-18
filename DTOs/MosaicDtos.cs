using System.Text.Json.Serialization;

namespace LandingPageEvent.DTOs;

/// <param name="U">Hình chữ nhật trên lưới nguyên [x, y, w, h] — đây là nguồn chuẩn.</param>
/// <param name="R">Bản chuẩn hoá [x, y, w, h] theo bề rộng lưới — tiện cho toạ độ world.</param>
public sealed record MosaicTileDto(
    [property: JsonPropertyName("i")] int Index,
    [property: JsonPropertyName("u")] int[] U,
    [property: JsonPropertyName("r")] double[] R,
    [property: JsonPropertyName("letterId")] string LetterId,
    [property: JsonPropertyName("postId")] int PostId,
    [property: JsonPropertyName("rank")] int Rank);

public sealed record MosaicLetterDto(
    string Id,
    string Char,
    string TintRole,
    string PrintHex,
    int Order);

public sealed record MosaicLatticeDto(int UnitsPerCap, int Rows, int Cols);

/// <param name="ViewBox">[rộng, cao] đã chuẩn hoá; rộng luôn bằng 1.</param>
/// <param name="EmptyTileCount">
/// Số ô chưa có ảnh. Bằng 0 trong dải vận hành bình thường; chỉ khác 0 khi số
/// ảnh còn dưới <paramref name="MinTilesForShape"/> — tức chưa đủ để vẽ hình chữ.
/// </param>
public sealed record MosaicLayoutResponse(
    string LayoutId,
    string GlyphVersion,
    string Mode,
    int PhotoCount,
    int TileCount,
    int EmptyTileCount,
    int MinTilesForShape,
    MosaicLatticeDto Lattice,
    double[] ViewBox,
    IReadOnlyList<MosaicLetterDto> Letters,
    IReadOnlyList<MosaicTileDto> Tiles);

/// <summary>Sức chứa của bố cục hiện tại, để giao diện quản trị cảnh báo sớm.</summary>
public sealed record MosaicCapacityResponse(
    string Mode,
    int MinPhotos,
    int MaxPhotosAtBaseLattice,
    int CurrentPhotoCount);
