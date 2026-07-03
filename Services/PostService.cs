using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using LandingPageEvent.Data;
using LandingPageEvent.DTOs;
using LandingPageEvent.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace LandingPageEvent.Services;

public sealed class PostService : IPostService
{
    private readonly AppDbContext _context;
    private readonly string _webRootPath;

    // Static Cache cho các bài viết đã duyệt hiển thị ở trang chủ (tối ưu hóa chịu tải)
    private static List<PostResponse>? _cachedApprovedPosts = null;
    private static readonly SemaphoreSlim _cacheLock = new(1, 1);

    // Mặt nạ chữ "IRIS 15" trong lưới 8 hàng x 70 cột (Đã cân đối và vuông vắn)
    private static readonly string[] IrisMask = new[]
    {
        "  ███████   ████████   ███████   █████████      ███      █████████    ",
        "    ███     ███  ███     ███     ███           ████      ███          ",
        "    ███     ███  ███     ███     ███          ██ ██      ███          ",
        "    ███     ████████     ███     █████████       ██      █████████    ",
        "    ███     ██████       ███           ███       ██            ███    ",
        "    ███     ███ ███      ███           ███       ██            ███    ",
        "    ███     ███  ███     ███     ███   ███       ██      ███   ███    ",
        "  ███████   ███   ███   ███████   █████████    ██████    █████████    "
    };

    public PostService(AppDbContext context)
    {
        _context = context;
        _context.Database.EnsureCreated();
        // Thư mục lưu trữ tĩnh trong dự án
        _webRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        EnsureDirectoriesExist();
        EnsureMockImagesExist();
        SeedMockData();
    }

    private void EnsureDirectoriesExist()
    {
        Directory.CreateDirectory(Path.Combine(_webRootPath, "uploads", "original"));
        Directory.CreateDirectory(Path.Combine(_webRootPath, "uploads", "thumbnail"));
        Directory.CreateDirectory(Path.Combine(_webRootPath, "uploads", "podcasts"));
        Directory.CreateDirectory(Path.Combine(_webRootPath, "uploads", "temp"));
    }

    private void EnsureMockImagesExist()
    {
        var mockImages = new[]
        {
            (Name: "mock_teambuilding.png", StartR: (byte)21, StartG: (byte)58, StartB: (byte)130, EndR: (byte)56, EndG: (byte)110, EndB: (byte)200), // Navy to Light Navy
            (Name: "mock_office.png", StartR: (byte)21, StartG: (byte)58, StartB: (byte)130, EndR: (byte)230, EndG: (byte)177, EndB: (byte)61), // Navy to Gold
            (Name: "mock_galadinner.png", StartR: (byte)230, StartG: (byte)177, StartB: (byte)61, EndR: (byte)245, EndG: (byte)158, EndB: (byte)11), // Gold to Amber
            (Name: "mock_iris_1.png", StartR: (byte)88, StartG: (byte)28, StartB: (byte)135, EndR: (byte)59, EndG: (byte)130, EndB: (byte)246), // Purple to Blue
            (Name: "mock_iris_2.png", StartR: (byte)59, StartG: (byte)130, StartB: (byte)246, EndR: (byte)16, EndG: (byte)185, EndB: (byte)129), // Blue to Emerald
            (Name: "mock_iris_3.png", StartR: (byte)16, StartG: (byte)185, StartB: (byte)129, EndR: (byte)245, EndG: (byte)158, EndB: (byte)11), // Emerald to Amber
            (Name: "mock_iris_4.png", StartR: (byte)245, StartG: (byte)158, StartB: (byte)11, EndR: (byte)239, EndG: (byte)68, EndB: (byte)68), // Amber to Red
            (Name: "mock_iris_5.png", StartR: (byte)239, StartG: (byte)68, StartB: (byte)68, EndR: (byte)236, EndG: (byte)72, EndB: (byte)153), // Red to Pink
            (Name: "mock_iris_6.png", StartR: (byte)99, StartG: (byte)102, StartB: (byte)241, EndR: (byte)139, EndG: (byte)92, EndB: (byte)246), // Indigo to Purple
            (Name: "mock_iris_7.png", StartR: (byte)6, StartG: (byte)182, StartB: (byte)212, EndR: (byte)59, EndG: (byte)130, EndB: (byte)246), // Cyan to Blue
            (Name: "mock_iris_8.png", StartR: (byte)234, StartG: (byte)179, StartB: (byte)8, EndR: (byte)249, EndG: (byte)115, EndB: (byte)22), // Yellow to Orange
            (Name: "mock_iris_9.png", StartR: (byte)217, StartG: (byte)70, StartB: (byte)239, EndR: (byte)147, EndG: (byte)51, EndB: (byte)234), // Fuchsia to Purple
            (Name: "mock_iris_10.png", StartR: (byte)20, StartG: (byte)184, StartB: (byte)166, EndR: (byte)16, EndG: (byte)185, EndB: (byte)129) // Teal to Emerald
        };

        foreach (var img in mockImages)
        {
            var originalPath = Path.Combine(_webRootPath, "uploads", "original", img.Name);
            var thumbnailPath = Path.Combine(_webRootPath, "uploads", "thumbnail", img.Name);

            if (!File.Exists(originalPath))
            {
                using (var image = new Image<Rgba32>(600, 600))
                {
                    for (int y = 0; y < 600; y++)
                    {
                        float ratioY = (float)y / 600;
                        for (int x = 0; x < 600; x++)
                        {
                            float ratioX = (float)x / 600;
                            float ratio = (ratioX + ratioY) / 2f;

                            byte r = (byte)(img.StartR + (img.EndR - img.StartR) * ratio);
                            byte g = (byte)(img.StartG + (img.EndG - img.StartG) * ratio);
                            byte b = (byte)(img.StartB + (img.EndB - img.StartB) * ratio);

                            image[x, y] = new Rgba32(r, g, b, 255);
                        }
                    }
                    image.SaveAsPng(originalPath);
                }
            }

            if (!File.Exists(thumbnailPath))
            {
                using (var image = new Image<Rgba32>(300, 300))
                {
                    for (int y = 0; y < 300; y++)
                    {
                        float ratioY = (float)y / 300;
                        for (int x = 0; x < 300; x++)
                        {
                            float ratioX = (float)x / 300;
                            float ratio = (ratioX + ratioY) / 2f;

                            byte r = (byte)(img.StartR + (img.EndR - img.StartR) * ratio);
                            byte g = (byte)(img.StartG + (img.EndG - img.StartG) * ratio);
                            byte b = (byte)(img.StartB + (img.EndB - img.StartB) * ratio);

                            image[x, y] = new Rgba32(r, g, b, 255);
                        }
                    }
                    image.SaveAsPng(thumbnailPath);
                }
            }
        }
    }

    private void SeedMockData()
    {
        if (!_context.MemoryPosts.Any())
        {
            var now = DateTimeOffset.UtcNow;
            _context.MemoryPosts.AddRange(
                new MemoryPost
                {
                    Message = "Chúc mừng sinh nhật IRIS tròn 15 tuổi! Tự hào là một mảnh ghép của đại gia đình IRIS thân thương. Chúc công ty ngày càng phát triển vững mạnh và vươn xa hơn nữa!",
                    Department = "Phòng Công Nghệ",
                    OriginalImagePath = "/uploads/original/mock_teambuilding.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_teambuilding.png",
                    VoteCount = 35,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-2)
                },
                new MemoryPost
                {
                    Message = "15 năm - một chặng đường nhiều thử thách nhưng cũng đầy vinh quang. Cảm ơn IRIS đã luôn là ngôi nhà thứ hai tuyệt vời của tôi, nơi tôi được học hỏi và lớn khôn mỗi ngày.",
                    Department = "Khối Kinh Doanh",
                    OriginalImagePath = "/uploads/original/mock_office.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_office.png",
                    VoteCount = 52,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-5)
                },
                new MemoryPost
                {
                    Message = "Gala Dinner 15 năm thật nhiều cảm xúc! Thật vui khi được cùng đồng đội nâng ly chúc mừng cột mốc lịch sử của công ty. IRIS 15 Years - Tự hào chặng đường vàng!",
                    Department = "Ban Truyền Thông",
                    OriginalImagePath = "/uploads/original/mock_galadinner.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_galadinner.png",
                    VoteCount = 18,
                    IsApproved = true,
                    CreatedAt = now.AddDays(-1)
                },
                new MemoryPost
                {
                    Message = "Một khoảnh khắc teambuilding đáng nhớ cùng anh em. Chúc IRIS tuổi mới bùng nổ hơn nữa!",
                    Department = "Ban Dự Án",
                    OriginalImagePath = "/uploads/original/mock_teambuilding.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_teambuilding.png",
                    VoteCount = 0,
                    IsApproved = false,
                    CreatedAt = now.AddMinutes(-30)
                },
                new MemoryPost
                {
                    Message = "Tầm nhìn của IRIS TECH là trở thành đơn vị cung cấp giải pháp CNTT hàng đầu Việt Nam. Tự hào được đóng góp công sức nhỏ bé của mình vào mục tiêu chung này!",
                    Department = "Ban Chiến Lược",
                    OriginalImagePath = "/uploads/original/mock_iris_1.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_1.png",
                    VoteCount = 25,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-12)
                },
                new MemoryPost
                {
                    Message = "Sứ mệnh tối ưu chi phí và gia tăng doanh thu cho khách hàng bằng công nghệ AI luôn là kim chỉ nam cho mọi dòng code của phòng sản phẩm chúng tôi.",
                    Department = "Phòng Sản Phẩm AI",
                    OriginalImagePath = "/uploads/original/mock_iris_2.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_2.png",
                    VoteCount = 30,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-10)
                },
                new MemoryPost
                {
                    Message = "IRIS luôn đi đầu trong việc phát triển công nghệ lõi chuyên sâu về giọng nói và văn bản tiếng Việt. Giải pháp AI của chúng tôi thực sự rất ấn tượng và mang tính ứng dụng cao!",
                    Department = "Phòng Nghiên Cứu Speech & NLP",
                    OriginalImagePath = "/uploads/original/mock_iris_3.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_3.png",
                    VoteCount = 42,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-8)
                },
                new MemoryPost
                {
                    Message = "Môi trường làm việc lý tưởng tại IRIS với chế độ phúc lợi toàn diện đã giúp tôi yên tâm công tác và cống hiến hết mình suốt 5 năm qua. Tự hào là một IRISer!",
                    Department = "Khối Hành Chính Nhân Sự",
                    OriginalImagePath = "/uploads/original/mock_iris_4.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_4.png",
                    VoteCount = 15,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-6)
                },
                new MemoryPost
                {
                    Message = "App DINO đi học 4.0 - ứng dụng giáo trí tiền tiểu học cho trẻ từ 2-6 tuổi do IRIS phát triển đã đạt cột mốc mới về lượt tải và đánh giá tích cực từ phụ huynh. Chúc mừng team Dino!",
                    Department = "Dự án Dino Đi Học",
                    OriginalImagePath = "/uploads/original/mock_iris_5.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_5.png",
                    VoteCount = 50,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-4)
                },
                new MemoryPost
                {
                    Message = "Hài hòa giữa các lợi ích của Đối tác - Doanh nghiệp - Xã hội là triết lý phát triển bền vững mà ban lãnh đạo IRIS luôn theo đuổi suốt chặng đường qua.",
                    Department = "Ban Giám Đốc",
                    OriginalImagePath = "/uploads/original/mock_iris_6.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_6.png",
                    VoteCount = 61,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-3)
                },
                new MemoryPost
                {
                    Message = "Làm việc chuyên nghiệp - Sản phẩm hoàn thiện - Dịch vụ chu đáo. Ba giá trị cốt lõi này đã làm nên thương hiệu IRIS TECH ngày hôm nay.",
                    Department = "Phòng Quản Trị Chất Lượng",
                    OriginalImagePath = "/uploads/original/mock_iris_7.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_7.png",
                    VoteCount = 22,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-2)
                },
                new MemoryPost
                {
                    Message = "Kỷ niệm chuyến đi Teambuilding Hè đáng nhớ vừa qua. Năng lượng của anh em IRIS luôn bùng nổ, gắn kết và sẵn sàng cho những thử thách mới!",
                    Department = "Công Đoàn IRIS",
                    OriginalImagePath = "/uploads/original/mock_iris_8.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_8.png",
                    VoteCount = 37,
                    IsApproved = true,
                    CreatedAt = now.AddHours(-1)
                },
                new MemoryPost
                {
                    Message = "Đêm Gala Dinner kỷ niệm 15 năm thật nhiều cảm xúc lắng đọng. Cảm ơn Ban lãnh đạo đã tổ chức một chương trình vô cùng hoành tráng và ý nghĩa cho tập thể CBNV!",
                    Department = "Phòng Truyền Thông Nội Bộ",
                    OriginalImagePath = "/uploads/original/mock_iris_9.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_9.png",
                    VoteCount = 48,
                    IsApproved = true,
                    CreatedAt = now.AddMinutes(-45)
                },
                new MemoryPost
                {
                    Message = "Tự hào là đơn vị khởi nghiệp công nghệ không ngừng nỗ lực để đem lại những giải pháp AI hữu ích nhất, đồng hành cùng doanh nghiệp Việt trong kỷ nguyên số.",
                    Department = "Khối Phát Triển Kinh Doanh",
                    OriginalImagePath = "/uploads/original/mock_iris_10.png",
                    ThumbnailImagePath = "/uploads/thumbnail/mock_iris_10.png",
                    VoteCount = 19,
                    IsApproved = true,
                    CreatedAt = now.AddMinutes(-15)
                }
            );
            _context.SaveChanges();
        }

        if (!_context.PodcastEpisodes.Any())
        {
            var now = DateTimeOffset.UtcNow;
            _context.PodcastEpisodes.AddRange(
                new PodcastEpisode
                {
                    PostId = 2,
                    Title = "Radio IRIS 15 - Số 1: Ngôi nhà thứ hai",
                    AudioPath = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                    DurationSeconds = 372,
                    CreatedAt = now.AddHours(-1)
                },
                new PodcastEpisode
                {
                    PostId = 1,
                    Title = "Radio IRIS 15 - Số 2: Tự hào một mảnh ghép",
                    AudioPath = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
                    DurationSeconds = 423,
                    CreatedAt = now.AddMinutes(-30)
                }
            );
            _context.SaveChanges();
        }
    }

    public async Task<PostResponse> CreatePostAsync(CreatePostRequest request, Stream imageStream, string fileName, CancellationToken ct)
    {
        var fileExtension = Path.GetExtension(fileName).ToLower();
        var uniqueFileName = $"{Guid.NewGuid()}{fileExtension}";

        var originalPath = Path.Combine(_webRootPath, "uploads", "original", uniqueFileName);
        var thumbnailPath = Path.Combine(_webRootPath, "uploads", "thumbnail", uniqueFileName);

        // 1. Lưu file ảnh gốc
        using (var fileStream = new FileStream(originalPath, FileMode.Create))
        {
            await imageStream.CopyToAsync(fileStream, ct);
        }

        // 2. Tạo ảnh thumbnail nén (Crop vuông 300x300 để xếp lưới cho đẹp)
        using (var image = await Image.LoadAsync(originalPath, ct))
        {
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(300, 300),
                Mode = ResizeMode.Crop
            }));
            await image.SaveAsync(thumbnailPath, ct);
        }

        // 3. Lưu vào Database (Mặc định IsApproved = false để kiểm duyệt trước)
        var post = new MemoryPost
        {
            Message = request.Message,
            Department = request.Department,
            OriginalImagePath = $"/uploads/original/{uniqueFileName}",
            ThumbnailImagePath = $"/uploads/thumbnail/{uniqueFileName}",
            VoteCount = 0,
            IsApproved = false,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.MemoryPosts.Add(post);
        await _context.SaveChangesAsync(ct);

        return new PostResponse(
            post.Id,
            post.Message,
            post.Department,
            post.ThumbnailImagePath,
            post.VoteCount,
            post.CreatedAt);
    }

    public async Task<IReadOnlyList<PostResponse>> GetApprovedPostsAsync(CancellationToken ct)
    {
        if (_cachedApprovedPosts != null)
        {
            return _cachedApprovedPosts;
        }

        await _cacheLock.WaitAsync(ct);
        try
        {
            if (_cachedApprovedPosts != null)
            {
                return _cachedApprovedPosts;
            }

            var posts = await _context.MemoryPosts
                .AsNoTracking()
                .Where(p => p.IsApproved)
                .ToListAsync(ct);

            _cachedApprovedPosts = posts
                .OrderByDescending(p => p.VoteCount)
                .ThenByDescending(p => p.CreatedAt)
                .Select(p => new PostResponse(
                    p.Id,
                    p.Message,
                    p.Department,
                    p.ThumbnailImagePath,
                    p.VoteCount,
                    p.CreatedAt))
                .ToList();

            return _cachedApprovedPosts;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    public async Task<IReadOnlyList<MemoryPost>> GetPendingPostsAsync(CancellationToken ct)
    {
        var pending = await _context.MemoryPosts
            .Where(p => !p.IsApproved)
            .ToListAsync(ct);

        return pending
            .OrderByDescending(p => p.CreatedAt)
            .ToList();
    }

    public async Task<bool> ApprovePostAsync(int id, bool approve, CancellationToken ct)
    {
        var post = await _context.MemoryPosts.FindAsync(new object[] { id }, ct);
        if (post == null) return false;

        if (approve)
        {
            post.IsApproved = true;
        }
        else
        {
            // Nếu từ chối, xóa file vật lý và xóa khỏi database
            var originalFull = Path.Combine(_webRootPath, post.OriginalImagePath.TrimStart('/'));
            var thumbFull = Path.Combine(_webRootPath, post.ThumbnailImagePath.TrimStart('/'));
            if (File.Exists(originalFull)) File.Delete(originalFull);
            if (File.Exists(thumbFull)) File.Delete(thumbFull);

            _context.MemoryPosts.Remove(post);
        }

        await _context.SaveChangesAsync(ct);
        _cachedApprovedPosts = null; // Xóa cache để cập nhật dữ liệu mới hiển thị
        return true;
    }

    public async Task<bool> VotePostAsync(int id, CancellationToken ct)
    {
        var post = await _context.MemoryPosts.FindAsync(new object[] { id }, ct);
        if (post == null || !post.IsApproved) return false;

        post.VoteCount++;
        await _context.SaveChangesAsync(ct);
        _cachedApprovedPosts = null; // Xóa cache khi số lượt tim thay đổi để cập nhật bảng xếp hạng
        return true;
    }

    public async Task ProcessQueuedUploadAsync(UploadWorkItem item, CancellationToken ct)
    {
        var fileExtension = Path.GetExtension(item.OriginalFileName).ToLower();
        var uniqueFileName = $"{Guid.NewGuid()}{fileExtension}";

        var originalPath = Path.Combine(_webRootPath, "uploads", "original", uniqueFileName);
        var thumbnailPath = Path.Combine(_webRootPath, "uploads", "thumbnail", uniqueFileName);

        // 1. Di chuyển file từ thư mục tạm sang thư mục ảnh gốc
        if (File.Exists(item.TempFilePath))
        {
            File.Move(item.TempFilePath, originalPath);
        }
        else
        {
            return; // File không tồn tại
        }

        // 2. Tạo ảnh thumbnail nén (Crop vuông 300x300 để xếp lưới)
        using (var image = await Image.LoadAsync(originalPath, ct))
        {
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(300, 300),
                Mode = ResizeMode.Crop
            }));
            await image.SaveAsync(thumbnailPath, ct);
        }

        // 3. Lưu vào Database (IsApproved = false chờ BTC duyệt)
        var post = new MemoryPost
        {
            Message = item.Message,
            Department = item.Department,
            OriginalImagePath = $"/uploads/original/{uniqueFileName}",
            ThumbnailImagePath = $"/uploads/thumbnail/{uniqueFileName}",
            VoteCount = 0,
            IsApproved = false,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.MemoryPosts.Add(post);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<byte[]> GenerateBackdropAsync(CancellationToken ct)
    {
        // Lấy danh sách tất cả ảnh gốc của các bài đăng đã duyệt
        var approvedPosts = await _context.MemoryPosts
            .AsNoTracking()
            .Where(p => p.IsApproved)
            .ToListAsync(ct);

        if (!approvedPosts.Any())
        {
            // Trả về ảnh đen mặc định nếu chưa có bài đăng nào được duyệt
            using var emptyImage = new Image<Rgba32>(3000, 1000);
            emptyImage.Mutate(ctx => ctx.BackgroundColor(Color.FromRgb(15, 23, 42))); // Màu tối corporate
            using var msEmpty = new MemoryStream();
            await emptyImage.SaveAsPngAsync(msEmpty, ct);
            return msEmpty.ToArray();
        }

        // Cấu hình lưới chữ IRIS 15
        int maskRows = IrisMask.Length;       // 7
        int maskCols = IrisMask[0].Length;    // 60

        // Phóng đại lưới lên 2 lần để có nhiều ô ảnh hơn (14 hàng x 120 cột)
        int scaleFactor = 2;
        int gridRows = maskRows * scaleFactor;
        int gridCols = maskCols * scaleFactor;

        // Tính kích thước mỗi ô ảnh trên Backdrop chất lượng cao (ví dụ: 150x150 pixels)
        int cellWidth = 150;
        int cellHeight = 150;

        // Tổng kích thước Backdrop (18000 x 2100 pixels)
        int canvasWidth = gridCols * cellWidth;
        int canvasHeight = gridRows * cellHeight;

        using var canvas = new Image<Rgba32>(canvasWidth, canvasHeight);
        canvas.Mutate(ctx => ctx.BackgroundColor(Color.FromRgb(15, 23, 42))); // Màu nền tối (Slate 900)

        int photoIndex = 0;

        for (int r = 0; r < gridRows; r++)
        {
            for (int c = 0; c < gridCols; c++)
            {
                // Ánh xạ ngược lại về tọa độ của IrisMask gốc
                int maskR = r / scaleFactor;
                int maskC = c / scaleFactor;

                if (IrisMask[maskR][maskC] == '█')
                {
                    // Lấy ảnh vòng lặp trong danh sách đã duyệt
                    var post = approvedPosts[photoIndex % approvedPosts.Count];
                    photoIndex++;

                    var originalPath = Path.Combine(_webRootPath, post.OriginalImagePath.TrimStart('/'));
                    if (File.Exists(originalPath))
                    {
                        try
                        {
                            using var tileImg = await Image.LoadAsync(originalPath, ct);
                            // Crop và resize ảnh cho vừa với ô của backdrop
                            tileImg.Mutate(ctx => ctx.Resize(new ResizeOptions
                            {
                                Size = new Size(cellWidth, cellHeight),
                                Mode = ResizeMode.Crop
                            }));

                            // Vẽ ảnh vào đúng vị trí ô lưới trên backdrop
                            int posX = c * cellWidth;
                            int posY = r * cellHeight;
                            canvas.Mutate(ctx => ctx.DrawImage(tileImg, new Point(posX, posY), 1.0f));
                        }
                        catch
                        {
                            // Bỏ qua nếu có ảnh lỗi để tránh dừng tiến trình render
                        }
                    }
                }
            }
        }

        using var ms = new MemoryStream();
        await canvas.SaveAsPngAsync(ms, ct);
        return ms.ToArray();
    }
}
