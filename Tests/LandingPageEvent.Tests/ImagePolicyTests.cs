using System.Text;
using LandingPageEvent.Services.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

// LandingPageEvent.Configuration là namespace của dự án, phải đặt bí danh rõ ràng.
using ImageSharpConfiguration = SixLabors.ImageSharp.Configuration;

namespace LandingPageEvent.Tests;

/// <summary>
/// Chốt chặn ảnh tải lên.
///
/// Điểm mấu chốt: ImageSharp nhận diện định dạng theo <b>nội dung file</b>, nên
/// danh sách đuôi file ở form upload không ngăn được một file GIF đổi tên thành
/// .png. Cả hai CVE của ImageSharp (CVE-2025-27598, CVE-2025-54575) đều nằm ở
/// bộ giải mã GIF, nên các test dưới đây khoá lại việc bộ giải mã đó không tồn
/// tại trong quá trình chạy — một lớp phòng thủ độc lập với việc nâng phiên bản.
/// </summary>
public class ImagePolicyTests
{
    private static readonly ImagePolicy Policy = new();

    private static MemoryStream Png(int w = 64, int h = 64)
    {
        var ms = new MemoryStream();
        using (var img = new Image<Rgba32>(w, h)) img.SaveAsPng(ms);
        ms.Position = 0;
        return ms;
    }

    private static MemoryStream Jpeg(int w = 64, int h = 64)
    {
        var ms = new MemoryStream();
        using (var img = new Image<Rgba32>(w, h)) img.SaveAsJpeg(ms);
        ms.Position = 0;
        return ms;
    }

    private static MemoryStream Webp(int w = 64, int h = 64)
    {
        var ms = new MemoryStream();
        using (var img = new Image<Rgba32>(w, h)) img.SaveAsWebp(ms);
        ms.Position = 0;
        return ms;
    }

    /// <summary>Dùng cấu hình mặc định của ImageSharp (có GIF) để tạo file tấn công.</summary>
    private static MemoryStream Gif(int w = 64, int h = 64)
    {
        var ms = new MemoryStream();
        using (var img = new Image<Rgba32>(ImageSharpConfiguration.Default, w, h)) img.SaveAsGif(ms);
        ms.Position = 0;
        return ms;
    }

    [Fact]
    public async Task Accepts_png()
    {
        var result = await Policy.ValidateAsync(Png(), TestContext.Current.CancellationToken);

        Assert.True(result.Ok, result.Error);
        Assert.Equal("PNG", result.Format);
        Assert.Equal(64, result.Width);
        Assert.Equal(64, result.Height);
    }

    [Fact]
    public async Task Accepts_jpeg()
    {
        var result = await Policy.ValidateAsync(Jpeg(), TestContext.Current.CancellationToken);

        Assert.True(result.Ok, result.Error);
        Assert.Equal("JPEG", result.Format);
    }

    [Fact]
    public async Task Accepts_webp()
    {
        var result = await Policy.ValidateAsync(Webp(), TestContext.Current.CancellationToken);

        Assert.True(result.Ok, result.Error);
        // ImageSharp báo tên định dạng là "Webp"; đối chiếu không phân biệt hoa thường.
        Assert.Equal("WEBP", result.Format, ignoreCase: true);
    }

    [Fact]
    public async Task Rejects_a_gif_even_though_the_bytes_are_a_valid_image()
    {
        // Đây chính là kịch bản tấn công: file GIF hợp lệ, đặt tên .png để lọt
        // qua danh sách đuôi file ở endpoint.
        var result = await Policy.ValidateAsync(Gif(), TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public async Task Gif_decoder_is_not_registered_at_all()
    {
        // Phòng thủ theo cấu trúc: kể cả khi có lối đi khác tới bộ giải mã, nó
        // không tồn tại trong Configuration mà ứng dụng dùng.
        var gifBytes = Gif().ToArray();

        await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            using var ms = new MemoryStream(gifBytes);
            using var _ = await Image.LoadAsync(Policy.Configuration, ms, TestContext.Current.CancellationToken);
        });

        // ...trong khi cấu hình mặc định thì giải mã được — chứng tỏ file là GIF hợp lệ.
        using var control = new MemoryStream(gifBytes);
        using var ok = await Image.LoadAsync(ImageSharpConfiguration.Default, control, TestContext.Current.CancellationToken);
        Assert.Equal(64, ok.Width);
    }

    [Fact]
    public async Task Rejects_svg_text()
    {
        // .svg từng nằm trong danh sách cho phép nhưng ImageSharp không giải mã
        // được, nên ảnh sẽ hỏng âm thầm ở worker nền.
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"></svg>";
        using var ms = new MemoryStream(Encoding.UTF8.GetBytes(svg));

        var result = await Policy.ValidateAsync(ms, TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
    }

    [Fact]
    public async Task Svg_is_not_in_the_allowed_extension_list()
    {
        await Task.CompletedTask;
        Assert.DoesNotContain(".svg", Policy.AllowedExtensions);
        Assert.Contains(".jpg", Policy.AllowedExtensions);
        Assert.Contains(".png", Policy.AllowedExtensions);
        Assert.Contains(".webp", Policy.AllowedExtensions);
    }

    [Fact]
    public async Task Rejects_arbitrary_non_image_bytes()
    {
        using var ms = new MemoryStream(Encoding.UTF8.GetBytes("MZ this is an executable, not a photo"));

        var result = await Policy.ValidateAsync(ms, TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
    }

    [Fact]
    public async Task Rejects_images_beyond_the_pixel_budget()
    {
        // Chặn "bom giải nén": file nén rất nhỏ nhưng giãn ra rất nhiều điểm ảnh.
        // Kiểm tra đọc header nên không bao giờ cấp phát bộ nhớ cho ảnh đó.
        var tiny = new ImagePolicy(maxPixels: 100);

        var result = await tiny.ValidateAsync(Png(64, 64), TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.Contains("quá lớn", result.Error);
    }

    [Fact]
    public async Task Leaves_the_stream_position_untouched_so_the_upload_can_still_be_saved()
    {
        using var stream = Png();
        stream.Position = 0;

        await Policy.ValidateAsync(stream, TestContext.Current.CancellationToken);

        Assert.Equal(0, stream.Position);
    }
}
