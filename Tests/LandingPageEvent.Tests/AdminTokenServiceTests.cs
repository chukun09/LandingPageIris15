using System;
using System.Collections.Generic;
using LandingPageEvent.Services.Auth;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LandingPageEvent.Tests;

public class AdminTokenServiceTests
{
    private static IAdminTokenService CreateService(string password = "test_password_123", string secret = "test_secret_key_abcdef123456")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Admin:Password"] = password,
                ["Admin:SecretKey"] = secret
            })
            .Build();

        return new AdminTokenService(config);
    }

    [Fact]
    public void ValidatePassword_CorrectPassword_ReturnsTrue()
    {
        var service = CreateService("my_secure_pass");
        Assert.True(service.ValidatePassword("my_secure_pass"));
    }

    [Theory]
    [InlineData("wrong_pass")]
    [InlineData("")]
    [InlineData("my_secure_pas")]
    [InlineData("MY_SECURE_PASS")]
    public void ValidatePassword_IncorrectOrEmpty_ReturnsFalse(string attempt)
    {
        var service = CreateService("my_secure_pass");
        Assert.False(service.ValidatePassword(attempt));
    }

    [Fact]
    public void GenerateAndValidateToken_FreshToken_ReturnsTrue()
    {
        var service = CreateService();
        var token = service.GenerateToken();

        Assert.NotNull(token);
        Assert.True(service.ValidateToken(token));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("invalid_token_format")]
    [InlineData("123:456")]
    [InlineData("abc:def:xyz")]
    public void ValidateToken_MalformedOrEmpty_ReturnsFalse(string? token)
    {
        var service = CreateService();
        Assert.False(service.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_TamperedSignature_ReturnsFalse()
    {
        var service = CreateService();
        var token = service.GenerateToken();
        var parts = token.Split(':');

        // Sửa signature của token
        var tamperedToken = $"{parts[0]}:{parts[1]}:bad_signature";
        Assert.False(service.ValidateToken(tamperedToken));
    }

    [Fact]
    public void ValidateToken_ExpiredToken_ReturnsFalse()
    {
        var service = CreateService();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        // Hết hạn từ 10 giây trước
        var expiredToken = $"{now - 100}:{now - 10}:dummy_signature";
        Assert.False(service.ValidateToken(expiredToken));
    }
}
