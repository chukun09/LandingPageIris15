namespace LandingPageEvent.Configuration;

/// <summary>
/// Bố cục chữ "IRIS 15" trong bức khảm.
/// </summary>
public enum MosaicLayoutMode
{
    /// <summary>Một dòng ngang "IRIS 15" (tỷ lệ ~5.7:1).</summary>
    Inline,

    /// <summary>"IRIS" trên, "15" dưới (tỷ lệ ~1.4:1).</summary>
    Stacked,

    /// <summary>Chỉ số "15" — phương án thoát khi số ảnh quá ít.</summary>
    DigitsOnly,
}

/// <summary>
/// Tham số của bộ sinh bố cục khảm. Toàn bộ đều là đầu vào của một hàm thuần:
/// cùng bộ tham số + cùng số ảnh luôn cho ra bố cục giống hệt nhau.
/// </summary>
public sealed class MosaicOptions
{
    public const string SectionName = "Mosaic";

    /// <summary>Đổi giá trị này khi hình dạng chữ thay đổi, để mọi cache tự hết hạn.</summary>
    public string GlyphVersion { get; set; } = "iris15-v3";

    public MosaicLayoutMode LayoutMode { get; set; } = MosaicLayoutMode.Inline;

    /// <summary>
    /// Số ô lưới đơn vị trên chiều cao chữ hoa.
    ///
    /// Phải bằng đúng 5 lần <see cref="StrokeUnits"/>: chữ S và số 5 cần năm dải
    /// ngang (xà trên → lỗ → xà giữa → lỗ → xà dưới). Nếu tỷ lệ nhỏ hơn 5, hai
    /// cái lỗ bị bóp mỏng hơn bề nét và mắt đọc ra một khối đặc thay vì chữ S.
    /// </summary>
    /// <remarks>
    /// Độ phân giải này chỉ quyết định độ mịn của ĐƯỜNG VIỀN chữ, hoàn toàn độc
    /// lập với số ô ảnh. Lưới càng mịn thì nét chéo của chữ R càng bớt bậc thang,
    /// trong khi số ô vẫn đúng bằng số ảnh.
    /// </remarks>
    public int UnitsPerCap { get; set; } = 60;

    /// <summary>Bề rộng nét chữ, tính bằng ô lưới đơn vị. Giữ tỷ lệ 1/5 chiều cao.</summary>
    public int StrokeUnits { get; set; } = 12;

    /// <summary>Cạnh nhỏ nhất của một ô ảnh, tính bằng ô lưới đơn vị.</summary>
    public int MinTileUnits { get; set; } = 4;

    /// <summary>Tỷ lệ khung tối đa cho phép của một ô ảnh (dài/rộng).</summary>
    public double MaxTileAspect { get; set; } = 2.0;

    /// <summary>Khoảng cách giữa hai chữ cái, tính bằng ô lưới đơn vị.</summary>
    public int TrackingUnits { get; set; } = 8;

    /// <summary>Khoảng cách giữa "IRIS" và "15", tính bằng ô lưới đơn vị.</summary>
    public int WordGapUnits { get; set; } = 20;

    /// <summary>Khoảng cách giữa hai dòng ở chế độ Stacked, tính bằng ô lưới đơn vị.</summary>
    public int LineGapUnits { get; set; } = 16;

    /// <summary>
    /// Số lần tối đa được phép nhân đôi độ phân giải lưới khi số ảnh vượt trần
    /// số ô mà lưới hiện tại có thể tách ra.
    /// </summary>
    public int MaxLatticeEscalations { get; set; } = 2;

    /// <summary>Rải các ảnh được yêu thích nhất đều qua 6 chữ cái thay vì dồn một chỗ.</summary>
    public bool LetterStratifiedAssignment { get; set; } = true;

    /// <summary>
    /// Màu in cho từng chữ cái, lấy từ logo IRIS 15: IRIS vàng kim, 15 xanh dương.
    /// Không dùng cho giao diện web (web đọc tintRole rồi tự chọn hex theo theme).
    /// </summary>
    public Dictionary<string, string> PrintPalette { get; set; } = new()
    {
        ["I0"] = "#D9A03A",
        ["R0"] = "#D9A03A",
        ["I1"] = "#D9A03A",
        ["S0"] = "#D9A03A",
        ["N1"] = "#1E50C8",
        ["N5"] = "#16337A",
    };
}
