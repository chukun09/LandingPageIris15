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

# Khóa API bí mật bảo vệ endpoint
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

# 3. Định nghĩa môi trường container chạy GPU CUDA 12.1 kèm đóng gói thư mục voices chuẩn xịn
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
        "huggingface_hub",
        "TTS==0.22.0",
        "fastapi[standard]",
        "pydantic"
    )
    # Upload thư mục voices chuẩn chất lượng cao lên container
    .add_local_dir("voices", "/root/voices")
)

# 4. Request Model DTO đồng bộ 100% với app.py
class TTSRequest(BaseModel):
    text: str
    speaker_wav: str = "voices/default_vietnamese.wav"
    language: str = "vi"
    speed: float = 1.08
    split_sentences: bool = False
    temperature: float = 0.72

# 5. Service ViXTTS chạy trên GPU NVIDIA T4
@app.cls(
    image=vixtts_image,
    gpu="T4",
    timeout=180,
    scaledown_window=300,
    volumes={"/root/.local/share/tts": tts_volume}
)
class ViXttsService:
    @modal.enter()
    def load_model(self):
        """Tải và nạp checkpoint viXTTS tiếng Việt chuẩn từ Hugging Face capleaf/viXTTS"""
        import os
        import torch
        from TTS.api import TTS
        from huggingface_hub import snapshot_download

        os.environ["COQUI_TOS_AGREED"] = "1"
        print(f"CUDA Available: {torch.cuda.is_available()} - GPU: {torch.cuda.get_device_name(0)}")

        model_dir = "/root/.local/share/tts/vixtts"
        config_path = os.path.join(model_dir, "config.json")
        model_path = os.path.join(model_dir, "model.pth")

        # Tải checkpoint tiếng Việt viXTTS nếu chưa có trong Volume
        if not os.path.exists(config_path) or not os.path.exists(model_path):
            print("Chưa có checkpoint viXTTS tiếng Việt. Đang tải từ Hugging Face (capleaf/viXTTS)...")
            snapshot_download(
                repo_id="capleaf/viXTTS",
                local_dir=model_dir,
                allow_patterns=["config.json", "model.pth", "vocab.json", "*.wav"]
            )
            try:
                tts_volume.commit()
            except Exception:
                pass
            print("Tải viXTTS tiếng Việt thành công và đã lưu vào Volume!")

        # Nạp mô hình tiếng Việt chuyên dụng bằng model_path
        print(f"Đang nạp mô hình viXTTS từ {model_dir}...")
        self.tts = TTS(
            model_path=model_dir,
            config_path=config_path,
            progress_bar=False,
            gpu=True
        )

        # Đảm bảo danh sách ngôn ngữ hỗ trợ bao gồm 'vi'
        try:
            tts_m = getattr(getattr(self.tts, "synthesizer", None), "tts_model", None)
            if tts_m and hasattr(tts_m, "config") and hasattr(tts_m.config, "languages"):
                if isinstance(tts_m.config.languages, list) and "vi" not in tts_m.config.languages:
                    tts_m.config.languages.append("vi")
        except Exception as e:
            print("Language config adjustment note:", e)

        # Tokenizer safeguard: chuyển mã ngôn ngữ tokenization sang 'en' để chạy qua vocab.json tiếng Việt
        try:
            if hasattr(self.tts, "synthesizer") and hasattr(self.tts.synthesizer, "tts_model"):
                tokenizer = getattr(self.tts.synthesizer.tts_model, "tokenizer", None)
                if tokenizer and hasattr(tokenizer, "preprocess_text"):
                    orig_preprocess = tokenizer.preprocess_text
                    def safe_preprocess_text(txt, lang):
                        langs = getattr(tokenizer, "languages", [])
                        if isinstance(langs, dict):
                            langs = list(langs.keys())
                        if not langs or lang not in langs:
                            lang = "en"
                        return orig_preprocess(txt, lang)
                    tokenizer.preprocess_text = safe_preprocess_text
        except Exception as e:
            print("Safeguard warning:", e)

        print("Đã nạp thành công mô hình viXTTS tiếng Việt vào GPU VRAM!")

        # Khởi động nóng GPU thực tế (Real CUDA Warm-up Inference)
        # Ép GPU compile sẵn CUDA kernels và nạp trước Speaker Latent vào VRAM
        try:
            sample_voice = "/root/voices/default_vietnamese.wav"
            if not os.path.exists(sample_voice):
                sample_voice = "/root/.local/share/tts/vixtts/vi_sample.wav"

            if os.path.exists(sample_voice):
                print("Đang chạy khởi động nóng GPU (CUDA Warmup Inference)...")
                warmup_wav = "/tmp/warmup_init.wav"
                self.tts.tts_to_file(
                    text="Xin chào IRIS.",
                    speaker_wav=sample_voice,
                    language="vi",
                    file_path=warmup_wav,
                    speed=1.0,
                    temperature=0.72
                )
                if os.path.exists(warmup_wav):
                    os.remove(warmup_wav)
                print("GPU CUDA Warmup hoàn tất 100%! Sẵn sàng phục vụ request siêu tốc.")
            else:
                print("Bỏ qua warmup: Không tìm thấy file giọng mẫu.")
        except Exception as ex:
            print("Lưu ý warmup (không ảnh hưởng):", ex)

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
            return {"status": "healthy", "gpu": "NVIDIA T4", "ready": True, "model": "viXTTS-Vietnamese"}

        @web.post("/api/tts")
        def generate(req: TTSRequest, x_api_key: str = Header(None, alias="X-API-Key")):
            if SECRET_API_KEY and x_api_key != SECRET_API_KEY:
                raise HTTPException(status_code=401, detail="Unauthorized: Khóa API Key không hợp lệ.")

            if not req.text or not req.text.strip():
                raise HTTPException(status_code=400, detail="Văn bản không được để trống")
            
            if len(req.text) > 1000:
                raise HTTPException(status_code=400, detail="Văn bản không được vượt quá 1000 ký tự")
            
            output_file = f"/tmp/tts_{uuid.uuid4().hex[:10]}.wav"
            try:
                # 1. Tìm file giọng mẫu chuẩn default_vietnamese.wav
                speaker_wav_path = req.speaker_wav
                if speaker_wav_path:
                    # Nếu là đường dẫn tương đối (vd: voices/default_vietnamese.wav), kiểm tra tại /root
                    if not os.path.isabs(speaker_wav_path):
                        candidate = os.path.join("/root", speaker_wav_path)
                        if os.path.exists(candidate):
                            speaker_wav_path = candidate

                # Nếu vẫn không tìm thấy, dùng trực tiếp giọng chuẩn tại /root/voices/default_vietnamese.wav
                if not speaker_wav_path or not os.path.exists(speaker_wav_path):
                    root_voice = "/root/voices/default_vietnamese.wav"
                    if os.path.exists(root_voice):
                        speaker_wav_path = root_voice
                    else:
                        speaker_wav_path = "/root/.local/share/tts/vixtts/vi_sample.wav"

                # 2. Chuẩn hóa chữ số và ký tự sang tiếng Việt
                clean_text = normalize_vietnamese_text(req.text)

                # 3. Đồng bộ 100% siêu tham số khử ngọng từ app.py
                self.tts.tts_to_file(
                    text=clean_text,
                    speaker_wav=speaker_wav_path,
                    language="vi",
                    file_path=output_file,
                    speed=req.speed,
                    split_sentences=req.split_sentences,
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
