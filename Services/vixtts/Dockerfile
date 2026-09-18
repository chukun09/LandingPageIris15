FROM python:3.10-slim

# Cài đặt ffmpeg và libsndfile1 phục vụ xử lý âm thanh
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip & setuptools < 70.0.0 (hỗ trợ pkg_resources cho Coqui TTS)
RUN pip install --no-cache-dir --upgrade pip "setuptools<70.0.0" wheel

# Cài đặt PyTorch CUDA 12.1 trước (Layer nặng nhất để Docker Cache lại)
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Copy requirements và cài đặt phiên bản chuẩn
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tạo thư mục chứa outputs và checkpoints
RUN mkdir -p outputs checkpoints voices

# Copy mã nguồn app.py trực tiếp
COPY app.py .

EXPOSE 8000

CMD ["python", "app.py"]
