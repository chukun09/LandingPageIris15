import os
import re
import uuid
import wave
import math
import struct
import logging
import modal
from fastapi import FastAPI, HTTPException, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 1. Khởi tạo Modal App & Ổ đĩa lưu Cache mô hình vĩnh viễn
app = modal.App("landingpage-vixtts")
tts_volume = modal.Volume.from_name("vixtts-cache", create_if_missing=True)

# Khóa API bí mật bảo vệ endpoint (ngăn người ngoài gọi trộm GPU)
SECRET_API_KEY = os.environ.get("VIXTTS_API_KEY", "iris-event-2026-secret-tts-key")

# 2. Hàm hỗ trợ chuẩn hóa tiếng Việt thuần (đọc số "15" -> "mười lăm", "%" -> "phần trăm")
def num2words_vi(n: int) -> str:
    if n == 0:
        return "không"
    units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]

    def _read_three_digits(num: int, has_higher: bool) -> str:
        h = num // 100
        t = (num % 100) // 10
        u = num % 10
        res = []
        if h > 0 or has_higher:
            res.append(f"{units[h]} trăm")
        if t == 0:
            if (h > 0 or has_higher) and u > 0:
                res.append("lẻ")
        elif t == 1:
            res.append("mười")
        else:
            res.append(f"{units[t]} mươi")
            
        if u == 1:
            if t > 1:
                res.append("mốt")
            else:
                res.append("một")
        elif u == 5:
            if t > 0:
                res.append("lăm")
            else:
                res.append("năm")
        elif u > 0:
            res.append(units[u])
        return " ".join(res)

    if n < 0:
        return "âm " + num2words_vi(-n)
        
    parts = []
    scales = ["", "nghìn", "triệu", "tỷ"]
    scale_idx = 0
    temp = n
    while temp > 0:
        chunk = temp % 1000
        temp = temp // 1000
        if chunk > 0:
            words = _read_three_digits(chunk, temp > 0)
            scale_name = scales[scale_idx]
            if scale_name:
                parts.insert(0, f"{words} {scale_name}")
            else:
                parts.insert(0, words)
        scale_idx += 1
        
    return " ".join(parts).strip()

def normalize_vietnamese_text(text: str) -> str:
    if not text:
        return text
    def replace_num(match):
        num_str = match.group(0)
        try:
            val = int(num_str)
            return f" {num2words_vi(val)} "
        except Exception:
            return num_str

    text = re.sub(r'\b\d+\b', replace_num, text)
    text = text.replace('%', ' phần trăm ')
    text = text.replace('&', ' và ')
    text = text.replace('+', ' cộng ')
    text = text.replace('@', ' a còng ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# 3. Định nghĩa môi trường container chạy GPU CUDA 12.1
# KHÔNG chạy code nạp model lúc build CPU để tránh 100% lỗi OSError: libcudart.so
vixtts_image = (
    modal.Image.debian_slim(python_version="3.10")
    .env({"COQUI_TOS_AGREED": "1"})
    .apt_install("ffmpeg", "libsndfile1", "git")
    .pip_install("setuptools<70.0.0", "wheel")
    .pip_install(
        "torch==2.3.1",
        "torchaudio==2.3.1",
        extra_index_url="https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "transformers==4.33.2",
        "tokenizers==0.13.3",
        "TTS==0.22.0",
        "fastapi[standard]",
        "pydantic"
    )
)

# 4. Request Model DTO
class TTSRequest(BaseModel):
    text: str
    speaker_wav: str = "voices/default_vietnamese.wav"
    language: str = "vi"
    speed: float = 1.08
    temperature: float = 0.72

# 5. Service ViXTTS chạy trên GPU NVIDIA T4 gắn kèm Volume lưu cache model
@app.cls(
    image=vixtts_image,
    gpu="T4",                         # Cấp GPU T4 (16GB VRAM)
    timeout=180,                      # Timeout tối đa 3 phút
    scaledown_window=120,             # Giữ GPU ấm 2 phút sau khi gọi
    volumes={"/root/.local/share/tts": tts_volume} # Gắn volume lưu trọng số model vĩnh viễn
)
class ViXttsService:
    @modal.enter()
    def load_model(self):
        """Khởi động mô hình vào VRAM một lần duy nhất khi container GPU bật lên"""
        import os
        import torch
        from TTS.api import TTS
        os.environ["COQUI_TOS_AGREED"] = "1"
        print(f"CUDA Available: {torch.cuda.is_available()} - GPU: {torch.cuda.get_device_name(0)}")
        
        # Nạp model (sẽ tự động tải vào /root/.local/share/tts nếu là lần đầu tiên, các lần sau có sẵn)
        self.tts = TTS(
            model_name="tts_models/multilingual/multi-dataset/xtts_v2",
            progress_bar=False,
            gpu=True
        )

        # Lưu thay đổi vào volume đám mây của Modal
        try:
            tts_volume.commit()
        except Exception:
            pass

        # Tokenizer safeguard cho tiếng Việt
        try:
            if hasattr(self.tts, "synthesizer") and hasattr(self.tts.synthesizer, "tts_model"):
                tokenizer = getattr(self.tts.synthesizer.tts_model, "tokenizer", None)
                if tokenizer and hasattr(tokenizer, "preprocess_text"):
                    orig_preprocess = tokenizer.preprocess_text
                    tokenizer.preprocess_text = lambda txt, lang: orig_preprocess(txt, "en" if lang == "vi" else lang)
        except Exception as e:
            print("Safeguard warning:", e)
        print("Đã nạp mô hình ViXTTS vào GPU VRAM thành công!")

    @modal.asgi_app()
    def web_endpoint(self):
        web = FastAPI(title="ViXTTS Modal API")
        
        web.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @web.get("/healthz")
        def health():
            return {"status": "healthy", "gpu": "NVIDIA T4", "ready": True}

        @web.post("/api/tts")
        def generate(req: TTSRequest, x_api_key: str = Header(None, alias="X-API-Key")):
            # Kiểm tra bảo mật: Nếu đã cấu hình API Key thì bắt buộc phải đúng
            if SECRET_API_KEY and x_api_key != SECRET_API_KEY:
                raise HTTPException(status_code=401, detail="Unauthorized: Khóa API Key không hợp lệ.")

            if not req.text or not req.text.strip():
                raise HTTPException(status_code=400, detail="Văn bản không được để trống")
            
            # Chặn văn bản quá dài để không bị lạm dụng GPU
            if len(req.text) > 1000:
                raise HTTPException(status_code=400, detail="Văn bản không được vượt quá 1000 ký tự")
            
            output_file = f"/tmp/tts_{uuid.uuid4().hex[:10]}.wav"
            try:
                # Sử dụng default speaker nếu không có voice custom
                default_voice = "/tmp/sample.wav"
                if not os.path.exists(default_voice):
                    import wave, math, struct
                    with wave.open(default_voice, 'w') as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(22050)
                        for i in range(22050 * 2):
                            v = int(32767.0 * 0.05 * math.sin(2.0 * math.pi * 440.0 * i / 22050))
                            wf.writeframes(struct.pack('<h', v))

                # Chuẩn hóa chữ số và ký tự sang tiếng Việt
                clean_text = normalize_vietnamese_text(req.text)

                self.tts.tts_to_file(
                    text=clean_text,
                    speaker_wav=default_voice,
                    language="vi",
                    file_path=output_file,
                    speed=req.speed,
                    temperature=req.temperature,
                    repetition_penalty=5.0,
                    top_k=50,
                    top_p=0.85
                )

                with open(output_file, "rb") as f:
                    audio_bytes = f.read()

                if os.path.exists(output_file):
                    os.remove(output_file)

                return Response(content=audio_bytes, media_type="audio/wav")
            except Exception as ex:
                raise HTTPException(status_code=500, detail=str(ex))

        return web
