using System;
using LandingPageEvent.Services;
using Xunit;

namespace LandingPageEvent.Tests;

public class PodcastTextSanitizerTests
{
    [Fact]
    public void SanitizeTextForSpeech_RemovesCommonEmojis()
    {
        // Arrange
        var input = "Chúc mừng 15 năm IRIS TECH ❤️❤️❤️ Thật tự hào 👍🎉 Chúc công ty phát triển 😊🔥";

        // Act
        var result = PodcastService.SanitizeTextForSpeech(input);

        // Assert
        Assert.DoesNotContain("❤️", result);
        Assert.DoesNotContain("👍", result);
        Assert.DoesNotContain("🎉", result);
        Assert.DoesNotContain("😊", result);
        Assert.DoesNotContain("🔥", result);
        Assert.Equal("Chúc mừng 15 năm IRIS TECH Thật tự hào Chúc công ty phát triển", result);
    }

    [Fact]
    public void SanitizeTextForSpeech_RemovesTextEmoticonsAndDecorations()
    {
        // Arrange
        var input = "Tuyệt vời quá sếp ơi <3 :) :D ^^ (y) !!! *** Rực rỡ";

        // Act
        var result = PodcastService.SanitizeTextForSpeech(input);

        // Assert
        Assert.DoesNotContain("<3", result);
        Assert.DoesNotContain(":)", result);
        Assert.DoesNotContain(":D", result);
        Assert.DoesNotContain("^^", result);
        Assert.DoesNotContain("(y)", result);
        Assert.DoesNotContain("***", result);
        Assert.Contains("Tuyệt vời quá sếp ơi", result);
        Assert.Contains("!", result);
        Assert.Contains("Rực rỡ", result);
    }

    [Fact]
    public void SanitizeTextForSpeech_HandlesNullOrWhitespace()
    {
        Assert.Equal(string.Empty, PodcastService.SanitizeTextForSpeech(null));
        Assert.Equal(string.Empty, PodcastService.SanitizeTextForSpeech("   "));
    }

    [Fact]
    public void SanitizeTextForSpeech_ReducesDuplicatePunctuation()
    {
        // Arrange
        var input = "Thật không thể tin được!!!!! Tuyệt cú mèo????? Đúng vậy.....";

        // Act
        var result = PodcastService.SanitizeTextForSpeech(input);

        // Assert
        Assert.Equal("Thật không thể tin được! Tuyệt cú mèo? Đúng vậy...", result);
    }

    [Fact]
    public void SanitizeTextForSpeech_RemovesQuotesAndHandlesNewlines()
    {
        // Arrange
        var input = "'CHUYẾN ĐI NHỎ,'\nKỶ NIỆM LỚN\n\"Hành trình 15 năm\"";

        // Act
        var result = PodcastService.SanitizeTextForSpeech(input);

        // Assert
        Assert.DoesNotContain("'", result);
        Assert.DoesNotContain("\"", result);
        Assert.Contains("CHUYẾN ĐI NHỎ,", result);
        Assert.Contains("KỶ NIỆM LỚN.", result);
        Assert.Contains("Hành trình 15 năm", result);
    }
}
