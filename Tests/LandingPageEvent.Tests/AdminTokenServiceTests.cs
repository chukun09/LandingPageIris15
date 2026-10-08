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

    [Fact]
    public void TestPublishRequestDeserialization()
    {
        var options = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        };
        var json1 = """{"orderedPostIds":[1,2,3]}""";
        var req1 = System.Text.Json.JsonSerializer.Deserialize<LandingPageEvent.Endpoints.PublishMosaicRequest>(json1, options);
        Assert.NotNull(req1);
        Assert.NotNull(req1.OrderedPostIds);
        Assert.Equal(3, req1.OrderedPostIds.Count);

        // Đảm bảo request chứa null (từ mảng sparse) không bị ném JsonException mà được parse an toàn
        var jsonWithNull = """{"orderedPostIds":[1,2,null,null,3],"tileAssignments":{"18":3}}""";
        var reqWithNull = System.Text.Json.JsonSerializer.Deserialize<LandingPageEvent.Endpoints.PublishMosaicRequest>(jsonWithNull, options);
        Assert.NotNull(reqWithNull);
        Assert.NotNull(reqWithNull.OrderedPostIds);
        Assert.Equal(5, reqWithNull.OrderedPostIds.Count);
        Assert.NotNull(reqWithNull.TileAssignments);
        Assert.Equal(3, reqWithNull.TileAssignments[18]);

        var clean = reqWithNull.OrderedPostIds
            .Where(x => x.HasValue && x.Value > 0)
            .Select(x => x!.Value)
            .ToList();
        Assert.Equal(new[] { 1, 2, 3 }, clean);
    }
}
