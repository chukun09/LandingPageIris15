using System;

namespace LandingPageEvent.Models;

/// <summary>
/// Đại diện cho một tập Podcast được chuyển thể từ bài viết của nhân viên.
/// </summary>
public class PodcastEpisode
{
    public int Id { get; set; }
    public int? PostId { get; set; }
    public required string Title { get; set; }
    public required string AudioPath { get; set; }
    public int DurationSeconds { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
