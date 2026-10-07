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
        if h > 0:
            res.append(f"{units[h]} trăm")
        elif has_higher:
            res.append("không trăm")
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
    """Tự động chuyển đổi con số, ký tự đặc biệt và phiên âm thuật ngữ sang tiếng Việt tự nhiên."""
    if not text:
        return text

    # 1. Số thập phân (vd: 4.0 -> bốn chấm không) và dải số (vd: 2-6 -> 2 đến 6)
    text = re.sub(r'(\d+)\.(\d+)', r'\1 chấm \2', text)
    text = re.sub(r'(\d+)\s*-\s*(\d+)', r'\1 đến \2', text)

    # 2. Ký hiệu phổ biến
    text = text.replace('%', ' phần trăm ')
    text = text.replace('&', ' và ')
    text = text.replace('+', ' cộng ')
    text = text.replace('@', ' a còng ')

    # 3. Từ viết tắt đặc thù doanh nghiệp (khớp chính xác chữ hoa, không dùng gạch nối tránh khựng âm)
    exact_acronyms = [
        (r'\bAI\b', 'Ây ai'),
        (r'\bCNTT\b', 'Công nghệ thông tin'),
        (r'\bCBNV\b', 'Cán bộ nhân viên'),
        (r'\bBTC\b', 'Ban tổ chức'),
        (r'\bBGD\b', 'Ban giám đốc'),
        (r'\bHĐQT\b', 'Hội đồng quản trị'),
        (r'\bCEO\b', 'Xi i ô'),
    ]
    for pattern, rep in exact_acronyms:
        text = re.sub(pattern, rep, text)

    # 4. Thương hiệu & thuật ngữ tiếng Anh thông dụng (không phân biệt hoa thường, không dùng gạch nối)
    case_insensitive = [
        (r'\bIRIS TECH\b', 'Iris Tech'),
        (r'\bIRIS\b', 'Iris'),
        (r'\bTeambuilding\b', 'Tim bin đing'),
        (r'\bGala Dinner\b', 'Ga la Đin nơ'),
        (r'\bGala\b', 'Ga la'),
        (r'\bApp\b', 'Ứng dụng'),
        (r'\bDINO\b', 'Đi nô'),
    ]
    for pattern, rep in case_insensitive:
        text = re.sub(pattern, rep, text, flags=re.IGNORECASE)

    # 5. Chuyển đổi toàn bộ con số nguyên thành chữ tiếng Việt
    def replace_num(match):
        num_str = match.group(0)
        try:
            val = int(num_str)
            return f" {num2words_vi(val)} "
        except Exception:
            return num_str

    text = re.sub(r'\b\d+\b', replace_num, text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def smart_chunk_vietnamese_text(text: str, max_chars: int = 220) -> list:
    """
    Phân đoạn văn bản tiếng Việt thông minh thành các câu trọn vẹn từ 80-220 ký tự,
    giữ trọn ngữ điệu tự nhiên và nhịp thở của câu, không bị băm vụn ở dấu phẩy,
    tuyệt đối không vượt quá giới hạn 250 ký tự của mô hình Coqui XTTS.
    """
    if not text or not text.strip():
        return []

    # 1. Tách theo dấu kết thúc câu (. ! ? hoặc xuống dòng)
    raw_sentences = re.split(r'([.!?\n]+)', text)
    sentences = []
    for i in range(0, len(raw_sentences), 2):
        s = raw_sentences[i].strip()
        punct = raw_sentences[i + 1].strip() if i + 1 < len(raw_sentences) else '.'
        if not punct or punct == '\n':
            punct = '.'
        if s:
            sentences.append(f"{s}{punct}")

    final_chunks = []
    for s in sentences:
        if len(s) <= max_chars:
            final_chunks.append(s)
            continue

        # Nếu câu dài hơn max_chars, ngắt tiếp theo dấu phẩy, chấm phẩy, hai chấm, gạch ngang
        raw_clauses = re.split(r'([,;:–—]+)', s)
        clauses = []
        for j in range(0, len(raw_clauses), 2):
            c = raw_clauses[j].strip()
            p = raw_clauses[j + 1].strip() if j + 1 < len(raw_clauses) else ''
            if c:
                clauses.append(f"{c}{p}")

        buf = ""
        for c in clauses:
            if not buf:
                buf = c
            elif len(buf) + len(c) + 1 <= max_chars:
                buf += " " + c
            else:
                final_chunks.append(buf)
                buf = c
        if buf:
            final_chunks.append(buf)

    # Đảm bảo tuyệt đối không có đoạn nào vượt max_chars kể cả câu không có dấu câu
    guaranteed_chunks = []
    for ch in final_chunks:
        if len(ch) <= max_chars:
            guaranteed_chunks.append(ch)
        else:
            words = ch.split()
            cur = ""
            for w in words:
                if not cur:
                    cur = w
                elif len(cur) + len(w) + 1 <= max_chars:
                    cur += " " + w
                else:
                    guaranteed_chunks.append(cur + ".")
                    cur = w
            if cur:
                guaranteed_chunks.append(cur)

    return guaranteed_chunks

def combine_wav_files(wav_paths: list, output_path: str, pause_sec: float = 0.14):
    """Ghép nối nhiều tệp WAV với khoảng lặng tự nhiên 140ms giữa các câu."""
    if not wav_paths:
        return
    if len(wav_paths) == 1:
        if wav_paths[0] != output_path:
            import shutil
            shutil.copyfile(wav_paths[0], output_path)
        return

    with wave.open(wav_paths[0], 'rb') as first_wav:
        params = first_wav.getparams()
        sample_rate = params.framerate
        num_channels = params.nchannels
        sampwidth = params.sampwidth

    silence_frames = int(sample_rate * pause_sec)
    silence_bytes = b'\x00' * (silence_frames * num_channels * sampwidth)

    with wave.open(output_path, 'wb') as out_wav:
        out_wav.setparams(params)
        for i, path in enumerate(wav_paths):
            with wave.open(path, 'rb') as in_wav:
                out_wav.writeframes(in_wav.readframes(in_wav.getnframes()))
            if i < len(wav_paths) - 1:
                out_wav.writeframes(silence_bytes)

# 3. Định nghĩa môi trường container chạy GPU CUDA 12.1 kèm đóng gói thư mục voices chuẩn xịn
VOICES_LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices")

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
    .add_local_dir(VOICES_LOCAL_DIR, "/root/voices")
)

# 4. Request Model DTO đồng bộ với cấu hình C#
class TTSRequest(BaseModel):
    text: str
    speaker_wav: str = "voices/default_vietnamese.wav"
    language: str = "vi"
    speed: float = 1.03
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
            
            if len(req.text) > 2500:
                raise HTTPException(status_code=400, detail="Văn bản không được vượt quá 2500 ký tự")
            
            output_file = f"/tmp/tts_{uuid.uuid4().hex[:10]}.wav"
            temp_chunk_files = []
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

                # 2. Chuẩn hóa chữ số, thuật ngữ doanh nghiệp và ký tự sang tiếng Việt
                clean_text = normalize_vietnamese_text(req.text)

                # 3. Phân đoạn thông minh (Smart Chunker): mỗi đoạn < 150 ký tự để triệt tiêu lỗi nuốt chữ và cảnh báo 250 ký tự
                chunks = smart_chunk_vietnamese_text(clean_text, max_chars=150)
                if not chunks:
                    chunks = [clean_text]

                # 4. Sinh âm thanh cho từng đoạn với siêu tham số vàng
                effective_speed = req.speed if (req.speed and req.speed > 0) else 1.03
                effective_temp = req.temperature if (req.temperature and req.temperature > 0) else 0.72

                if len(chunks) == 1:
                    self.tts.tts_to_file(
                        text=chunks[0],
                        speaker_wav=speaker_wav_path,
                        language="vi",
                        file_path=output_file,
                        speed=effective_speed,
                        split_sentences=False,
                        temperature=effective_temp,
                        repetition_penalty=1.85,
                        top_k=50,
                        top_p=0.82
                    )
                else:
                    for idx, chunk in enumerate(chunks):
                        chunk_path = f"/tmp/tts_chunk_{uuid.uuid4().hex[:8]}_{idx}.wav"
                        temp_chunk_files.append(chunk_path)
                        self.tts.tts_to_file(
                            text=chunk,
                            speaker_wav=speaker_wav_path,
                            language="vi",
                            file_path=chunk_path,
                            speed=effective_speed,
                            split_sentences=False,
                            temperature=effective_temp,
                            repetition_penalty=1.85,
                            top_k=50,
                            top_p=0.82
                        )
                    # Ghép các đoạn thành file hoàn chỉnh với khoảng lặng tự nhiên 140ms giữa câu
                    combine_wav_files(temp_chunk_files, output_file, pause_sec=0.14)

                with open(output_file, "rb") as f:
                    audio_bytes = f.read()

                return Response(content=audio_bytes, media_type="audio/wav")
            except Exception as ex:
                raise HTTPException(status_code=500, detail=str(ex))
            finally:
                if os.path.exists(output_file):
                    try:
                        os.remove(output_file)
                    except Exception:
                        pass
                for tf in temp_chunk_files:
                    if os.path.exists(tf):
                        try:
                            os.remove(tf)
                        except Exception:
                            pass

        return web
