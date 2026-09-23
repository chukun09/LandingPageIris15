namespace LandingPageEvent.DTOs;

/// <param name="SourceShortEdgePx">Cạnh ngắn của ảnh gốc.</param>
/// <param name="RequiredPx">Cạnh mà ô được gán đòi hỏi trên bản in.</param>
public sealed record BackdropWarningDto(int PostId, int SourceShortEdgePx, int RequiredPx);

/// <param name="EstimatedPeakMb">Bộ nhớ đỉnh ước tính khi dựng, tính bằng MB.</param>
/// <param name="ExceedsMemoryCap">Vượt trần megapixel cấu hình cho máy chủ này.</param>
public sealed record ExistingBackdropFileDto(
    string FileName,
    long FileBytes,
    System.DateTimeOffset CreatedAt,
    string PreviewUrl,
    string DownloadUrl,
    bool IsCurrentLayout,
    int? PhotoCountInFile);

public sealed record BackdropPreflightResponse(
    int PhotoCount,
    int MinPhotos,
    int TrimWidthMm,
    int TrimHeightMm,
    int EffectiveDpi,
    int MetadataDpi,
    int CanvasWidthPx,
    int CanvasHeightPx,
    long Megapixels,
    long EstimatedPeakMb,
    bool ExceedsMemoryCap,
    int LargestTileEdgePx,
    string Format,
    string Theme,
    IReadOnlyList<BackdropWarningDto> LowResolutionPhotos,
    ExistingBackdropFileDto? ExistingFile = null);

public sealed record BackdropJobResponse(
    Guid JobId,
    string State,
    double Progress,
    string Stage,
    string? Error,
    int PhotoCount,
    string? FileName,
    long FileBytes,
    int CanvasWidthPx,
    int CanvasHeightPx,
    string Theme,
    string? PreviewUrl,
    string? DownloadUrl,
    IReadOnlyList<BackdropWarningDto> Warnings);
