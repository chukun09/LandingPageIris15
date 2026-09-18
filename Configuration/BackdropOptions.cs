namespace LandingPageEvent.Configuration;

public enum BackdropFormat
{
    /// <summary>JPEG chất lượng cao — bản giao chính, gửi được qua email/Zalo.</summary>
    Jpeg,

    /// <summary>TIFF nén Deflate — bản master không mất dữ liệu.</summary>
    Tiff,

    /// <summary>PNG — chỉ giữ làm tuỳ chọn; với ảnh chụp thì nặng ngang TIFF mà encode chậm hơn.</summary>
    Png,
}

public enum TintMode
{
    Off,
    Subtle,
    Strong,
}

/// <summary>
/// Nền của bản in.
///
/// Không chỉ là đảo màu nền: viền ô và ô thương hiệu phải pha ngược chiều thì
/// hình chữ mới còn tương phản. Trên nền tối, viền sáng lên mới tách được ô;
/// trên nền giấy thì ngược lại.
/// </summary>
public enum BackdropTheme
{
    /// <summary>Nền gần đen — hợp phông sân khấu, đèn rọi.</summary>
    Dark,

    /// <summary>Nền giấy trắng ấm — hợp backdrop chụp ảnh trong nhà.</summary>
    Light,
}

/// <summary>
/// Thông số dựng file in backdrop.
///
/// Toàn bộ đều tính theo <b>milimét thực tế</b> chứ không phải pixel: nhà in làm
/// việc với kích thước vật lý, và pixel chỉ là hệ quả của mm × DPI.
/// </summary>
public sealed class BackdropOptions
{
    public const string SectionName = "Backdrop";

    /// <summary>Khổ thành phẩm, tính bằng mm.</summary>
    public int TrimWidthMm { get; set; } = 6000;
    public int TrimHeightMm { get; set; } = 3000;

    /// <summary>Phần tràn lề mỗi cạnh. Hiflex may gân / đóng khoen ăn 20–30 mm.</summary>
    public int BleedMm { get; set; } = 30;

    /// <summary>Lề an toàn tính từ mép thành phẩm; không nội dung nào được vượt vào.</summary>
    public int SafeMarginMm { get; set; } = 80;

    /// <summary>
    /// DPI tại kích thước thật. 60–75 là chuẩn cho hiflex nhìn từ 3 m trở lên;
    /// 300 DPI ở khổ 6 m là bất khả thi và cũng không cần.
    /// </summary>
    public int EffectiveDpi { get; set; } = 60;

    /// <summary>
    /// Chỉ ghi vào metadata: file 1:5 @ 300 DPI và file 1:1 @ 60 DPI là CÙNG một
    /// mảng pixel. Đặt số này để nhà in đọc ra quy ước quen thuộc của họ.
    /// </summary>
    public int ScaleDenominator { get; set; } = 5;

    /// <summary>
    /// Trần số điểm ảnh đầu ra.
    ///
    /// Quy đổi theo số đo thực: <b>khoảng 9 MB working set cho mỗi triệu điểm ảnh</b>
    /// (103 Mpx đo được 934 MB). Chọn trần theo RAM máy chủ, chừa chỗ cho chính
    /// ứng dụng web: máy 4 GB nên để dưới 300, máy 2 GB nên để dưới 150.
    /// </summary>
    public int MaxOutputMegapixels { get; set; } = 150;

    public BackdropFormat Format { get; set; } = BackdropFormat.Jpeg;
    public int JpegQuality { get; set; } = 92;

    /// <summary>Cạnh dài của ảnh xem trước hiển thị trên web.</summary>
    public int PreviewMaxEdgePx { get; set; } = 2500;
    public int PreviewJpegQuality { get; set; } = 80;

    /// <summary>Theme mặc định khi không chỉ định trên yêu cầu.</summary>
    public BackdropTheme Theme { get; set; } = BackdropTheme.Dark;

    /// <summary>Nền của bản tối. Đủ đen để ảnh nổi, không phải đen tuyệt đối.</summary>
    public string BackgroundColorDark { get; set; } = "#0B0C0E";

    /// <summary>Nền của bản sáng. Trắng ấm, cùng tông giấy với logo gốc.</summary>
    public string BackgroundColorLight { get; set; } = "#FAF8F4";

    // ── Bố cục các khối trên tấm backdrop, tính theo tỷ lệ vùng an toàn ──────
    /// <summary>Bề rộng logo, theo tỷ lệ bề rộng vùng an toàn.</summary>
    public double LogoWidthFraction { get; set; } = 0.16;
    public bool ShowLogo { get; set; } = true;

    /// <summary>Bề rộng dải chữ khảm, theo tỷ lệ bề rộng vùng an toàn.</summary>
    public double MosaicWidthFraction { get; set; } = 1.0;

    /// <summary>Tâm dải chữ theo chiều dọc, tính theo tỷ lệ chiều cao vùng an toàn.</summary>
    public double MosaicCenterYFraction { get; set; } = 0.56;

    // ── Mã QR dẫn về trang web ──────────────────────────────────────────────
    public bool ShowQrCode { get; set; } = true;
    public string QrPayload { get; set; } = "https://iristech.vn";
    public double QrWidthFraction { get; set; } = 0.07;

    // ── Xử lý màu từng ô để chữ đọc được từ xa ──────────────────────────────
    public TintMode Tint { get; set; } = TintMode.Subtle;

    /// <summary>Độ mạnh nhuộm màu thương hiệu lên ảnh, 0..1.</summary>
    public double TintStrength { get; set; } = 0.26;

    /// <summary>Độ bão hoà giữ lại của ảnh trước khi nhuộm, 0..1.</summary>
    public double TintSaturation { get; set; } = 0.65;

    /// <summary>Độ sáng đích khi chuẩn hoá từng ô, 0..1.</summary>
    public double TargetLuma { get; set; } = 0.52;
    public double LumaGainMin { get; set; } = 0.78;
    public double LumaGainMax { get; set; } = 1.35;

    /// <summary>Viền trong mỗi ô, theo tỷ lệ cạnh ô. Đây là thứ làm chữ "ăn" ở xa.</summary>
    public double TileBorderFraction { get; set; } = 0.022;
    public bool TileBorderEnabled { get; set; } = true;

    /// <summary>
    /// Mức pha viền ô về phía nền. Trên bản tối thì pha về trắng cho viền sáng
    /// lên; trên bản sáng thì pha về đen. Cùng một con số, hai hướng ngược nhau.
    /// </summary>
    public double TileBorderContrast { get; set; } = 0.32;

    /// <summary>Độ đậm/nhạt của ô chưa có ảnh so với màu chữ.</summary>
    public double EmptyPlateMix { get; set; } = 0.5;

    // ── Bộ đệm ảnh nguồn ────────────────────────────────────────────────────
    /// <summary>Cạnh của bản ảnh trung gian dùng khi ghép, thay cho ảnh gốc 12 MP.</summary>
    public int SourceCacheEdgePx { get; set; } = 1600;

    public string CacheDirectory { get; set; } = "uploads/backdrop";
    public string SourceCacheDirectory { get; set; } = "uploads/mosaic";

    /// <summary>
    /// Trần cấp phát của ImageSharp cho việc dựng ảnh. Vượt qua sẽ ném
    /// <c>InvalidMemoryOperationException</c> bắt được, thay vì để hệ điều hành
    /// giết cả tiến trình giữa sự kiện.
    /// </summary>
    public int AllocationLimitMb { get; set; } = 2048;

    /// <summary>
    /// Trần bộ nhớ mà bộ cấp phát được giữ lại giữa các lần dùng. Để mặc định
    /// (không giới hạn) thì working set phình lên gấp ba kích thước khung ảnh.
    /// </summary>
    public int PoolSizeLimitMb { get; set; } = 192;
    public int MaxDegreeOfParallelism { get; set; } = 2;
}
