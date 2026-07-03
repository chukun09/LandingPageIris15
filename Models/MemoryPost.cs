using System;

namespace LandingPageEvent.Models;

/// <summary>
/// Đại diện cho một bài viết ký ức từ CBNV tải lên.
/// </summary>
public class MemoryPost
{
    public int Id { get; set; }
    public required string Message { get; set; }
    public string? Department { get; set; }
    public required string OriginalImagePath { get; set; }
    public required string ThumbnailImagePath { get; set; }
    public int VoteCount { get; set; }
    public bool IsApproved { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
