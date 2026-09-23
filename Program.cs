using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Primitives;
using Microsoft.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using LandingPageEvent.Data;
using LandingPageEvent.Endpoints;
using LandingPageEvent.HealthChecks;
using LandingPageEvent.Middleware;
using LandingPageEvent.Services;
using LandingPageEvent.Services.TTS;

var builder = WebApplication.CreateBuilder(args);

// Đăng ký Health Checks
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"])
    .AddCheck<StorageHealthCheck>("storage", tags: ["ready"])
    .AddCheck<ViXttsHealthCheck>("vixtts", tags: ["tts"]);

// 1. Cấu hình Cơ sở dữ liệu (Hỗ trợ PostgreSQL / Supabase & SQLite Local Fallback)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? Environment.GetEnvironmentVariable("DATABASE_URL");

if (!string.IsNullOrWhiteSpace(connectionString) &&
    (connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase) ||
     connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase) ||
     connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
     connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)))
{
    // Hỗ trợ cả định dạng URI postgresql://user:pass@host:port/dbname từ Supabase
    if (connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(connectionString);
        var userInfo = uri.UserInfo.Split(':');
        var user = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
        var pass = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var db = uri.AbsolutePath.TrimStart('/');
        var port = uri.Port > 0 ? uri.Port : 5432;
        connectionString = $"Host={uri.Host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Require;Trust Server Certificate=true;No Reset On Close=true";
    }
    else if (!connectionString.Contains("No Reset On Close", StringComparison.OrdinalIgnoreCase))
    {
        connectionString = connectionString.TrimEnd(';') + ";No Reset On Close=true";
    }

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connectionString));
}
else
{
    var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "iris15.db");
    Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(), "Data"));
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite($"Data Source={dbPath}"));
}

// 2. Đăng ký Caching, HttpClient và các Service nghiệp vụ
builder.Services.AddMemoryCache();
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

// Khởi tạo Database schema một lần duy nhất lúc khởi động ứng dụng (Tránh Race Condition khi nhiều request đến cùng lúc)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsNpgsql())
    {
        const string initSql = @"
CREATE TABLE IF NOT EXISTS ""MemoryPosts"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY,
    ""Message"" character varying(2000) NOT NULL,
    ""Department"" character varying(100),
    ""OriginalImagePath"" character varying(500) NOT NULL,
    ""ThumbnailImagePath"" character varying(500) NOT NULL,
    ""VoteCount"" integer NOT NULL,
    ""IsApproved"" boolean NOT NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL,
    CONSTRAINT ""PK_MemoryPosts"" PRIMARY KEY (""Id"")
);

CREATE TABLE IF NOT EXISTS ""PodcastEpisodes"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY,
    ""PostId"" integer,
    ""Title"" character varying(200) NOT NULL,
    ""AudioPath"" character varying(500) NOT NULL,
    ""DurationSeconds"" integer NOT NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL,
    CONSTRAINT ""PK_PodcastEpisodes"" PRIMARY KEY (""Id"")
);";
        db.Database.ExecuteSqlRaw(initSql);
    }
    else
    {
        db.Database.EnsureCreated();
    }
}

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

// 10. Đăng ký các endpoints Health Checks
// Liveness probe: Kiểm tra process ứng dụng có phản hồi không
app.MapHealthChecks("/healthz", new HealthCheckOptions
{
    Predicate = _ => false
});

// Readiness probe: Kiểm tra toàn diện DB, Storage và Services
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = HealthCheckResponseWriter.WriteResponse
});

// Endpoint /health chung trả về định dạng JSON chi tiết
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthCheckResponseWriter.WriteResponse
});

// Khởi chạy ứng dụng
app.Run();
