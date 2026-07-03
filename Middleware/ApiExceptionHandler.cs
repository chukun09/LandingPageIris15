using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace LandingPageEvent.Middleware;

internal sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = exception switch
        {
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Không tìm thấy dữ liệu"),
            ArgumentException => (StatusCodes.Status400BadRequest, "Yêu cầu không hợp lệ"),
            InvalidOperationException => (StatusCodes.Status409Conflict, "Xung đột dữ liệu"),
            _ => (0, (string?)null)
        };

        if (statusCode == 0)
        {
            return false; // Để mặc định ASP.NET Core xử lý
        }

        logger.LogWarning(exception, "Đã xử lý ngoại lệ API: {Title}", title);

        httpContext.Response.StatusCode = statusCode;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = exception.Message,
            Instance = httpContext.Request.Path
        }, cancellationToken);

        return true;
    }
}
