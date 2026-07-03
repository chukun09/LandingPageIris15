using System;
using System.ComponentModel.DataAnnotations;

namespace LandingPageEvent.DTOs;

/// <summary>
/// Yêu cầu tạo mới bài viết kỷ niệm từ nhân viên.
/// </summary>
public sealed record CreatePostRequest
{
    /// <summary>
    /// Nội dung chia sẻ hoặc lời chúc (Tối đa 2000 ký tự).
    /// </summary>
    [Required(ErrorMessage = "Nội dung chia sẻ là bắt buộc.")]
    [MaxLength(2000, ErrorMessage = "Nội dung chia sẻ không được vượt quá 2000 ký tự.")]
    public required string Message { get; init; }

    /// <summary>
    /// Tên phòng ban của nhân viên (Tùy chọn, tối đa 100 ký tự).
    /// </summary>
    [MaxLength(100, ErrorMessage = "Tên phòng ban không được vượt quá 100 ký tự.")]
    public string? Department { get; init; }
}

/// <summary>
/// Phản hồi thông tin bài viết kỷ niệm hiển thị trên Bức tường ký ức.
/// </summary>
public sealed record PostResponse(
    int Id,
    string Message,
    string? Department,
    string ThumbnailUrl,
    int VoteCount,
    DateTimeOffset CreatedAt);

/// <summary>
/// Phản hồi thông tin tập Podcast AI.
/// </summary>
public sealed record PodcastResponse(
    int Id,
    int? PostId,
    string Title,
    string AudioUrl,
    int DurationSeconds,
    DateTimeOffset CreatedAt);
