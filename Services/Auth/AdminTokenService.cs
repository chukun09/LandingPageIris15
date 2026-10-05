using System;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace LandingPageEvent.Services.Auth;

public interface IAdminTokenService
{
    bool ValidatePassword(string password);
    string GenerateToken();
    bool ValidateToken(string? token);
}

public sealed class AdminTokenService : IAdminTokenService
{
    private readonly string _configuredPassword;
    private readonly byte[] _secretKeyBytes;

    public AdminTokenService(IConfiguration configuration)
    {
        _configuredPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD")
            ?? configuration["Admin:Password"]
            ?? "iris2026@@";

        var secret = Environment.GetEnvironmentVariable("ADMIN_SECRET")
            ?? configuration["Admin:SecretKey"]
            ?? "iris15-event-secret-signing-key-2026-secure-random-token";

        _secretKeyBytes = Encoding.UTF8.GetBytes(secret);
    }

    public bool ValidatePassword(string password)
    {
        if (string.IsNullOrEmpty(password))
        {
            return false;
        }

        var inputBytes = Encoding.UTF8.GetBytes(password);
        var expectedBytes = Encoding.UTF8.GetBytes(_configuredPassword);

        return CryptographicOperations.FixedTimeEquals(inputBytes, expectedBytes);
    }

    public string GenerateToken()
    {
        var now = DateTimeOffset.UtcNow;
        var issuedAt = now.ToUnixTimeSeconds();
        var expiresAt = now.AddDays(7).ToUnixTimeSeconds();

        var payload = $"{issuedAt}:{expiresAt}";
        using var hmac = new HMACSHA256(_secretKeyBytes);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var signature = Convert.ToHexString(hash);

        return $"{payload}:{signature}";
    }

    public bool ValidateToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        var parts = token.Split(':');
        if (parts.Length != 3)
        {
            return false;
        }

        if (!long.TryParse(parts[0], out var issuedAt) || !long.TryParse(parts[1], out var expiresAt))
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (now > expiresAt || issuedAt > now + 60)
        {
            return false;
        }

        var payload = $"{parts[0]}:{parts[1]}";
        using var hmac = new HMACSHA256(_secretKeyBytes);
        var expectedHash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var expectedSignature = Convert.ToHexString(expectedHash);

        var tokenSigBytes = Encoding.UTF8.GetBytes(parts[2]);
        var expectedSigBytes = Encoding.UTF8.GetBytes(expectedSignature);

        return CryptographicOperations.FixedTimeEquals(tokenSigBytes, expectedSigBytes);
    }
}
