using System.Text.Json.Serialization;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Primitives;
using Microsoft.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using LandingPageEvent.Data;
using LandingPageEvent.Endpoints;
using LandingPageEvent.Middleware;
using LandingPageEvent.Services;
using LandingPageEvent.Services.TTS;

var builder = WebApplication.CreateBuilder(args);

// 1. Cấu hình Cơ sở dữ liệu SQLite
var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "iris15.db");
Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(), "Data"));
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// 2. Đăng ký HttpClient và các Service nghiệp vụ
builder.Services.AddHttpClient("ViXttsClient", client =>
{
    client.Timeout = TimeSpan.FromSeconds(60); // Timeout cho ViXTTS GPU Synthesis
});
builder.Services.AddHttpClient();

// Đăng ký các TTS Providers cho Strategy Pattern
builder.Services.AddScoped<ITtsProvider, ViXttsProvider>();
builder.Services.AddScoped<ITtsProvider, AzureTtsProvider>();

// Chốt chặn ảnh: giữ một Configuration của ImageSharp chỉ đăng ký bộ giải mã
// JPEG/PNG/WebP → bộ giải mã GIF (nơi CVE-2025-27598 và CVE-2025-54575 nằm)
// không tồn tại trong quá trình chạy, kể cả khi file bị đổi tên để giả dạng.
builder.Services.AddSingleton<LandingPageEvent.Services.Imaging.IImagePolicy,
                              LandingPageEvent.Services.Imaging.ImagePolicy>();

// Bố cục khảm: hàm thuần, kết quả được ghi nhớ theo layoutId → đăng ký Singleton.
builder.Services.Configure<LandingPageEvent.Configuration.MosaicOptions>(
    builder.Configuration.GetSection(LandingPageEvent.Configuration.MosaicOptions.SectionName));
builder.Services.AddSingleton<LandingPageEvent.Services.Mosaic.IMosaicLayoutService,
                              LandingPageEvent.Services.Mosaic.MosaicLayoutService>();
builder.Services.AddSingleton<LandingPageEvent.Services.Mosaic.IMosaicAtlasService,
                              LandingPageEvent.Services.Mosaic.MosaicAtlasService>();

// Pipeline dựng file in backdrop: đồng thời đúng một job vì mỗi job giữ một
// khung ảnh hàng trăm megabyte.
builder.Services.Configure<LandingPageEvent.Configuration.BackdropOptions>(
    builder.Configuration.GetSection(LandingPageEvent.Configuration.BackdropOptions.SectionName));
builder.Services.AddSingleton<LandingPageEvent.Services.Backdrop.IMosaicSourceCache,
                              LandingPageEvent.Services.Backdrop.MosaicSourceCache>();
builder.Services.AddScoped<LandingPageEvent.Services.Backdrop.IBackdropRenderer,
                           LandingPageEvent.Services.Backdrop.BackdropRenderer>();
builder.Services.AddSingleton<LandingPageEvent.Services.Backdrop.IBackdropJobQueue,
                              LandingPageEvent.Services.Backdrop.BackdropJobQueue>();
builder.Services.AddHostedService<LandingPageEvent.Services.Backdrop.BackdropJobWorker>();

builder.Services.AddScoped<IPostService, PostService>();
builder.Services.AddScoped<IPodcastService, PodcastService>();
builder.Services.AddSingleton<IUploadQueue, UploadQueue>();
builder.Services.AddHostedService<UploadBackgroundWorker>();

// 3. Đăng ký bộ xử lý ngoại lệ toàn cục
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddProblemDetails();

// 4. Cấu hình JSON Serialization (Chuyển đổi Enum thành String)
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// 5. Cấu hình OpenAPI (Swagger) cho .NET 10
builder.Services.AddOpenApi();

// 6. Cấu hình CORS để phục vụ môi trường phát triển (tùy chọn)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// 7. Nén phản hồi. Bundle JS/CSS và JSON layout đang được gửi không nén,
//    đây là khoản tiết kiệm băng thông lớn nhất mà không đụng tới code ứng dụng.
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/javascript",
        "text/javascript",
        "application/json",
        "image/svg+xml",
        "application/manifest+json",
    });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o =>
    o.Level = System.IO.Compression.CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o =>
    o.Level = System.IO.Compression.CompressionLevel.Optimal);

var app = builder.Build();

// Nén phải chạy TRƯỚC static files thì mới nén được nội dung tĩnh.
app.UseResponseCompression();

// Sử dụng CORS và Exception Handler
app.UseCors();
app.UseExceptionHandler();

// 8. Cấu hình phục vụ giao diện tĩnh (HTML/CSS/JS) từ wwwroot
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        var headers = ctx.Context.Response.GetTypedHeaders();

        if (path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase))
        {
            // Vite băm nội dung vào tên file → an toàn để cache vĩnh viễn.
            // Đặt thẳng chuỗi vì CacheControlHeaderValue không có `immutable`.
            ctx.Context.Response.Headers.CacheControl =
                new StringValues("public, max-age=31536000, immutable");
        }
        else if (path.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            // Ảnh người dùng: tên file là GUID nên nội dung không đổi,
            // nhưng vẫn để ngắn hơn phòng khi phải thay thủ công trong sự kiện.
            headers.CacheControl = new CacheControlHeaderValue
            {
                Public = true,
                MaxAge = TimeSpan.FromHours(1),
            };
        }
        else
        {
            // index.html và các file gốc: luôn kiểm tra lại để deploy có hiệu lực ngay.
            headers.CacheControl = new CacheControlHeaderValue
            {
                Public = true,
                NoCache = true,
            };
        }
    },
});

// Kích hoạt OpenAPI trong môi trường Development
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// 9. Đăng ký các nhóm API
app.MapPostEndpoints();
app.MapPodcastEndpoints();
app.MapAdminEndpoints();
app.MapMosaicEndpoints();
app.MapBackdropEndpoints();

// Khởi chạy ứng dụng
app.Run();
