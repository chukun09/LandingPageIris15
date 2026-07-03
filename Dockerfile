# ─── Stage 1: Build React Frontend ───
FROM node:20-alpine AS frontend-build
WORKDIR /src

# Copy package config và cài đặt dependencies
COPY Frontend/package*.json ./Frontend/
RUN cd Frontend && npm install

# Copy toàn bộ code frontend và build
COPY Frontend/ ./Frontend/
RUN cd Frontend && npm run build

# ─── Stage 2: Build ASP.NET Core Backend ───
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src

# Copy file project và restore NuGet packages
COPY LandingPageEvent.csproj ./
RUN dotnet restore

# Copy toàn bộ mã nguồn backend
COPY . ./

# Copy thư mục wwwroot đã được frontend build (từ Stage 1) vào wwwroot của backend
COPY --from=frontend-build /src/wwwroot ./wwwroot

# Publish dự án backend ra thư mục /app
RUN dotnet publish -c Release -o /app

# ─── Stage 3: Run Application ───
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=backend-build /app .

# Thiết lập Render port binding động qua CMD shell
EXPOSE 80
CMD ["sh", "-c", "dotnet LandingPageEvent.dll --urls http://0.0.0.0:${PORT:-80}"]
