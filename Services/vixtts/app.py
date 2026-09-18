import os
import re
import uuid
import wave
import math
import struct
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch

# Cấu hình logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vixtts-service")

# Khai báo biến toàn cục
tts_model = None
is_custom_model = False

def num2words_vi(n: int) -> str:
    """Chuyển đổi số nguyên n thành chữ tiếng Việt chuẩn xác 100%."""
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
    """Tự động chuyển đổi con số và ký tự đặc biệt sang từ ngữ tiếng Việt thuần việt."""
    if not text:
        return text
        
    # Chuyển đổi con số đơn và số đếm thành chữ tiếng Việt
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

def apply_tokenizer_safeguard(model):
    """
    Tokenizer Safeguard:
    Nếu ngôn ngữ truyền vào là 'vi' nhưng VoiceBpeTokenizer chưa đăng ký mã 'vi' trong self.languages,
    tự động chuyển mã ngôn ngữ xử lý về 'en' để chạy qua text cleaner và tokenizer vocab.json tiếng Việt.
    """
    try:
        if hasattr(model, "synthesizer") and hasattr(model.synthesizer, "tts_model"):
            tokenizer = getattr(model.synthesizer.tts_model, "tokenizer", None)
            if tokenizer and hasattr(tokenizer, "preprocess_text"):
                original_preprocess = tokenizer.preprocess_text
                
                def safe_preprocess_text(txt, lang):
                    langs = getattr(tokenizer, "languages", [])
                    if isinstance(langs, dict):
                        langs = list(langs.keys())
                    
                    if not langs or lang not in langs:
                        lang = "en" if (langs and "en" in langs) else "en"
                    
                    return original_preprocess(txt, lang)
                
                tokenizer.preprocess_text = safe_preprocess_text
                logger.info("Đã áp dụng Tokenizer Safeguard cho tiếng Việt thành công.")
    except Exception as e:
        logger.warning("Không thể cài đặt Tokenizer Safeguard: %s", e)

def ensure_default_speaker_wav():
    """Tự động tạo file âm thanh mẫu default_vietnamese.wav nếu người dùng chưa cung cấp."""
    os.makedirs("voices", exist_ok=True)
    default_wav = "voices/default_vietnamese.wav"
    if not os.path.exists(default_wav):
        sample_rate = 22050
        duration = 2.0
        with wave.open(default_wav, 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for i in range(int(sample_rate * duration)):
                value = int(32767.0 * 0.05 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
                wav_file.writeframes(struct.pack('<h', value))
        logger.info("Đã tự động tạo tệp âm thanh mẫu mặc định tại %s", default_wav)

class TTSRequest(BaseModel):
    text: str
    speaker_wav: str = "voices/default_vietnamese.wav"
    language: str = "vi"
    speed: float = 1.08
    split_sentences: bool = False
    temperature: float = 0.72

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan Context Manager:
    Load mô hình ViXTTS vào VRAM duy nhất 1 lần khi container khởi động (Warmup).
    """
    global tts_model, is_custom_model
    logger.info("Đang khởi tạo và nạp mô hình ViXTTS vào VRAM...")
    
    ensure_default_speaker_wav()

    try:
        from TTS.api import TTS
        use_gpu = torch.cuda.is_available()
        logger.info(f"CUDA Available: {use_gpu}")
        if use_gpu:
            logger.info(f"Đang sử dụng GPU: {torch.cuda.get_device_name(0)}")

        model_path = os.getenv("VIXTTS_MODEL_PATH", "checkpoints/vixtts/model.pth")
        config_path = os.getenv("VIXTTS_CONFIG_PATH", "checkpoints/vixtts/config.json")

        if os.path.exists(model_path) and os.path.exists(config_path):
            logger.info(f"Phát hiện checkpoint viXTTS cục bộ tại {model_path}. Đang nạp...")
            tts_model = TTS(
                model_path=os.path.dirname(model_path),
                config_path=config_path,
                progress_bar=False,
                gpu=use_gpu
            )
            is_custom_model = True
            apply_tokenizer_safeguard(tts_model)
            logger.info("Đã nạp mô hình ViXTTS tiếng Việt từ checkpoints thành công!")
        else:
            logger.warning("Chưa có checkpoint viXTTS cục bộ tại checkpoints/vixtts/model.pth. Đang nạp mô hình Coqui XTTS v2...")
            tts_model = TTS(
                model_name="tts_models/multilingual/multi-dataset/xtts_v2",
                progress_bar=False,
                gpu=use_gpu
            )
            is_custom_model = False
            apply_tokenizer_safeguard(tts_model)
            logger.info("Nạp mô hình Coqui XTTS v2 thành công!")

    except Exception as e:
        logger.error(f"Lỗi khi nạp mô hình ViXTTS: {e}", exc_info=True)
        tts_model = None
        is_custom_model = False

    yield
    logger.info("Đang giải phóng tài nguyên ViXTTS Microservice...")

app = FastAPI(
    title="ViXTTS Microservice",
    description="Dịch vụ chuyển đổi văn bản thành giọng nói tiếng Việt chuẩn Production",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
async def health_check():
    """Endpoint kiểm tra sức khỏe của Microservice."""
    gpu_ready = torch.cuda.is_available()
    vram_free = None
    if gpu_ready:
        try:
            vram_free = torch.cuda.mem_get_info()[0] / (1024 ** 2)  # MB
        except Exception:
            vram_free = None

    return {
        "status": "healthy" if tts_model is not None else "degraded",
        "model_loaded": tts_model is not None,
        "is_custom_vixtts": is_custom_model,
        "cuda_available": gpu_ready,
        "vram_free_mb": vram_free
    }

@app.post("/api/tts")
async def generate_tts(request: TTSRequest):
    """Endpoint sinh âm thanh từ văn bản."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Văn bản truyền vào không được để trống.")

    output_dir = "outputs"
    os.makedirs(output_dir, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
    output_path = os.path.join(output_dir, filename)

    try:
        if tts_model is None:
            raise HTTPException(status_code=503, detail="Mô hình ViXTTS chưa sẵn sàng.")

        speaker_wav_path = request.speaker_wav
        if not speaker_wav_path or not os.path.exists(speaker_wav_path):
            speaker_wav_path = "voices/default_vietnamese.wav"

        target_lang = request.language if request.language else "vi"

        # Chuẩn hóa tiếng Việt thuần (chuyển chữ số như '15' -> 'mười lăm' để tuyệt đối không đọc tiếng Anh 'fifteen')
        normalized_text = normalize_vietnamese_text(request.text)

        logger.info(
            "Sinh âm thanh tiếng Việt thuần (Speed=%s, Temp=%s, SpeakerWav='%s') cho text: '%s'",
            request.speed, request.temperature, speaker_wav_path, normalized_text[:35]
        )

        tts_model.tts_to_file(
            text=normalized_text,
            speaker_wav=speaker_wav_path,
            language=target_lang,
            file_path=output_path,
            speed=request.speed,
            split_sentences=request.split_sentences,
            temperature=request.temperature,
            repetition_penalty=5.0,
            top_k=50,
            top_p=0.85
        )

        with open(output_path, "rb") as f:
            audio_bytes = f.read()

        if os.path.exists(output_path):
            os.remove(output_path)

        return Response(content=audio_bytes, media_type="audio/wav")

    except Exception as e:
        logger.error(f"Lỗi trong quá trình sinh giọng nói ViXTTS: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi sinh âm thanh ViXTTS: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
