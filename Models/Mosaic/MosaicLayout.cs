namespace LandingPageEvent.Models.Mosaic;

/// <summary>Thông tin ảnh mà bộ sinh bố cục cần — không phụ thuộc vào EF entity.</summary>
public readonly record struct MosaicPostRef(int Id, int VoteCount, DateTimeOffset CreatedAt);

/// <summary>
/// Vai trò màu của một chữ cái, lấy thẳng từ logo IRIS 15: bốn chữ IRIS màu vàng
/// kim, hai chữ số 15 màu xanh dương. Web tự quyết hex theo theme; bản in dùng PrintHex.
/// </summary>
public static class TintRoles
{
    public const string Gold = "gold";
    public const string Blue = "blue";
}

public sealed record LetterInfo(
    string Id,
    string Char,
    string TintRole,
    string PrintHex,
    int Order);

public sealed record LatticeInfo(int UnitsPerCap, int Rows, int Cols);

/// <summary>
/// Một ô ảnh trong bức khảm.
/// </summary>
/// <param name="Index">Số thứ tự ô, theo thứ tự đọc (trên xuống, trái sang phải).</param>
/// <param name="Unit">Hình chữ nhật trên lưới nguyên. Đây là nguồn chuẩn.</param>
/// <param name="LetterId">Chữ cái mà ô thuộc về.</param>
/// <param name="PostId">Ảnh được gán vào ô, -1 nếu chưa có.</param>
/// <param name="Rank">Thứ hạng gán (0 = ảnh được ưu tiên nhất).</param>
public sealed record MosaicTile(
    int Index,
    LatticeRect Unit,
    string LetterId,
    int PostId,
    int Rank)
{
    public int AreaUnits => Unit.Area;
}

/// <summary>
/// Bố cục khảm hoàn chỉnh — nguồn chuẩn duy nhất dùng chung cho khung 3D trên web
/// và cho file in backdrop.
/// </summary>
/// <param name="MinTilesForShape">
/// Số ô tối thiểu để hình chữ tồn tại. Khi số ảnh còn ít hơn con số này, bố cục
/// vẫn được dựng đủ hình và phần dư mang PostId = -1 (ô thương hiệu).
/// </param>
public sealed record MosaicLayout(
    string LayoutId,
    string GlyphVersion,
    string Mode,
    int PhotoCount,
    int MinTilesForShape,
    LatticeInfo Lattice,
    IReadOnlyList<LetterInfo> Letters,
    IReadOnlyList<MosaicTile> Tiles)
{
    /// <summary>Tỷ lệ khung của toàn bộ hình chữ (rộng/cao).</summary>
    public double Aspect => (double)Lattice.Cols / Math.Max(1, Lattice.Rows);

    /// <summary>Số ô chưa có ảnh — chỉ khác 0 khi số ảnh dưới ngưỡng hình học.</summary>
    public int EmptyTileCount => Tiles.Count - Math.Min(PhotoCount, Tiles.Count);
}
