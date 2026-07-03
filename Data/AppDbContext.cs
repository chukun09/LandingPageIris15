using Microsoft.EntityFrameworkCore;
using LandingPageEvent.Models;

namespace LandingPageEvent.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<MemoryPost> MemoryPosts => Set<MemoryPost>();
    public DbSet<PodcastEpisode> PodcastEpisodes => Set<PodcastEpisode>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MemoryPost>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Message).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.Department).HasMaxLength(100);
            entity.Property(e => e.OriginalImagePath).IsRequired().HasMaxLength(500);
            entity.Property(e => e.ThumbnailImagePath).IsRequired().HasMaxLength(500);
        });

        modelBuilder.Entity<PodcastEpisode>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.AudioPath).IsRequired().HasMaxLength(500);
        });
    }
}
