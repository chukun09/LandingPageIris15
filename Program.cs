using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using LandingPageEvent.Data;
using LandingPageEvent.Endpoints;
using LandingPageEvent.Middleware;
using LandingPageEvent.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Cấu hình Cơ sở dữ liệu SQLite
var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "iris15.db");
Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(), "Data"));
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// 2. Đăng ký HttpClient và các Service nghiệp vụ
builder.Services.AddHttpClient();
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

var app = builder.Build();

// Sử dụng CORS và Exception Handler
app.UseCors();
app.UseExceptionHandler();

// 7. Cấu hình phục vụ giao diện tĩnh (HTML/CSS/JS) từ wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

// Kích hoạt OpenAPI trong môi trường Development
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// 8. Đăng ký các nhóm API
app.MapPostEndpoints();
app.MapPodcastEndpoints();
app.MapAdminEndpoints();

// Khởi chạy ứng dụng
app.Run();
