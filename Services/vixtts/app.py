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

def clean_emojis_and_symbols(text: str) -> str:
    """Loại bỏ toàn bộ emoji, text emoticon, biểu tượng cảm xúc và ký tự trang trí trước khi tổng hợp giọng nói."""
    if not text:
        return text

    # 1. Text emoticons thông dụng (<3, </3, (y), (Y), :), :D, ^^, v.v.)
    text_emoticons = [
        r'</?3\b', r'<3', r'♡', r'♥',
        r'\([yYnN]\)',
        r':[-~]?[)DdpP(\]/\\]+',
        r';[-~]?[)D(\]/\\]+',
        r'(\^[-_]?\^|\^\^|-_+|>_<|T_T|@@)',
    ]
    for emo in text_emoticons:
        text = re.sub(emo, ' ', text)

    # 2. Toàn bộ dải Unicode Emoji & Symbols (mặt cười, cử chỉ giơ tay/like, tim, hoa, pháo hoa...)
    emoji_pattern = re.compile(
        '['
        '\U0001F600-\U0001F64F'  # Emoticons / Smileys
        '\U0001F300-\U0001F5FF'  # Symbols & Pictographs (tim, like, hoa, pháo hoa...)
        '\U0001F680-\U0001F6FF'  # Transport & Map
        '\U0001F1E0-\U0001F1FF'  # Flags
        '\U0001F900-\U0001F9FF'  # Supplemental Symbols (cụng ly, ôm, bắt tay...)
        '\U0001FA00-\U0001FA6F'  # Chess
        '\U0001FA70-\U0001FAFF'  # Extended Pictographs (trái tim màu, đồ vật mới...)
        '\u2600-\u26FF'          # Misc Symbols (sao, mặt trời, ô dù, trái tim đen/trắng...)
        '\u2700-\u27BF'          # Dingbats (tim đỏ, kéo, bút, dấu tích, sao...)
        '\uFE00-\uFE0F'          # Variation Selectors
        '\u200D'                  # Zero Width Joiner
        '\u20E3'                  # Combining Enclosing Keycap
        '\u2B50\u2B55\u231A\u231B\u23E9-\u23EC\u23F0\u23F3'  # Sao ⭐, đồng hồ ⏰...
        ']+', flags=re.UNICODE
    )
    text = emoji_pattern.sub(' ', text)

    # 3. Ký tự trang trí, bullet points, ký hiệu code không dùng khi đọc
    text = re.sub(r'[*~#^_|\\<>{}\[\]=•●◆■★☆►▸▶/]+', ' ', text)

    # 3b. Loại bỏ triệt để mọi loại dấu nháy đơn, nháy kép, dấu trích dẫn, backtick (tránh XTTS đọc lằng nhằng hoặc rè âm)
    text = re.sub(r'[\'"`“”‘’„«»´′″\u2018\u2019\u201C\u201D\u0027\u0022]+', ' ', text)

    # 4. Gom dấu câu lặp lại: !!! -> !, ??? -> ?, .... -> ...
    text = re.sub(r'!+', '!', text)
    text = re.sub(r'\?+', '?', text)
    text = re.sub(r'\.{4,}', '...', text)
    return text

def normalize_vietnamese_text(text: str) -> str:
    """Tự động chuyển đổi con số, ký tự đặc biệt và phiên âm thuật ngữ sang tiếng Việt tự nhiên."""
    if not text:
        return text

    # 0. Loại bỏ hoàn toàn emojis, text emoticons và ký tự trang trí
    text = clean_emojis_and_symbols(text)

    # 1. Chuẩn hóa xuống dòng \n:
    # Nếu dòng kết thúc chưa có dấu câu (. ! ?), chèn dấu chấm để tách câu rành mạch (vd: Tiêu đề -> Tiêu đề.)
    text = re.sub(r'([^.!?\s])\s*\n+', r'\1. ', text)
    # Nếu dòng đã kết thúc bằng dấu phẩy (,), thay bằng dấu phẩy và khoảng trắng để nối câu sau mượt mà
    text = re.sub(r',\s*\n+', r', ', text)
    # Các dấu xuống dòng còn lại đổi thành khoảng trắng
    text = re.sub(r'\n+', ' ', text)

    # 2. Số thập phân (vd: 4.0 -> bốn chấm không) và dải số (vd: 2-6 -> 2 đến 6)
    text = re.sub(r'(\d+)\.(\d+)', r'\1 chấm \2', text)
    text = re.sub(r'(\d+)\s*-\s*(\d+)', r'\1 đến \2', text)

    # 3. Ký hiệu phổ biến
    text = text.replace('%', ' phần trăm ')
    text = text.replace('&', ' và ')
    text = text.replace('+', ' cộng ')
    text = text.replace('@', ' a còng ')

    # 4. Từ viết tắt đặc thù doanh nghiệp (khớp chính xác chữ hoa, không dùng gạch nối tránh khựng âm)
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

    # 5. Thương hiệu & thuật ngữ tiếng Anh thông dụng (không phân biệt hoa thường, không dùng gạch nối)
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

    # 6. Chuyển đổi toàn bộ con số nguyên thành chữ tiếng Việt
    def replace_num(match):
        num_str = match.group(0)
        try:
            val = int(num_str)
            return f" {num2words_vi(val)} "
        except Exception:
            return num_str

    text = re.sub(r'\b\d+\b', replace_num, text)

    # 7. Khử dấu câu xung đột liền kề nhau: vd: ,. hoặc ., hoặc ,, hoặc .!
    text = re.sub(r'[,;:–—]+\s*([.!?])', r'\1', text)
    text = re.sub(r'([.!?])\s*[,;:–—]+', r'\1', text)
    text = re.sub(r'[,;:–—]{2,}', ',', text)
    text = re.sub(r'\.{4,}', '...', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def smart_chunk_vietnamese_text(text: str, max_chars: int = 240) -> list:
    """
    Phân đoạn văn bản tiếng Việt thông minh thành các câu trọn vẹn từ 70-240 ký tự,
    giữ trọn ngữ điệu tự nhiên và nhịp thở của câu, không bị băm vụn ở giữa câu,
    tuyệt đối không cắt ngang cụm từ ngữ/con số và không vượt quá giới hạn mô hình Coqui XTTS.
    """
    if not text or not text.strip():
        return []

    # 1. Tách theo dấu kết thúc câu thực sự (. ! ?)
    raw_sentences = re.split(r'([.!?]+)', text)
    sentences = []
    for i in range(0, len(raw_sentences), 2):
        s = raw_sentences[i].strip()
        punct = raw_sentences[i + 1].strip() if i + 1 < len(raw_sentences) else '.'
        if not punct:
            punct = '.'
        if s:
            sentences.append(f"{s}{punct}")

    # 2. Gộp các câu / tiêu đề quá ngắn (< 35 ký tự) vào câu sau để tránh XTTS bị thiếu context gây nói nhảm
    merged_sentences = []
    i = 0
    while i < len(sentences):
        cur = sentences[i]
        # Nếu câu hiện tại quá ngắn và còn câu tiếp theo, thử gộp
        while len(cur) < 35 and i + 1 < len(sentences) and len(cur) + len(sentences[i + 1]) + 1 <= max_chars:
            cur = f"{cur} {sentences[i + 1]}"
            i += 1
        merged_sentences.append(cur)
        i += 1

    # 3. Với các câu dài > max_chars, ngắt thông minh tại dấu phẩy, chấm phẩy hoặc liên từ tự nhiên
    final_chunks = []
    for s in merged_sentences:
        if len(s) <= max_chars:
            final_chunks.append(s)
            continue

        # Cố gắng tách tại dấu phẩy, chấm phẩy, hai chấm, gạch ngang
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
                # Đảm bảo cuối chunk có dấu ngắt câu tự nhiên
                if not re.search(r'[.!?]$', buf):
                    buf = re.sub(r'[,;:–—]+$', '', buf).strip() + '.'
                final_chunks.append(buf)
                buf = c
        if buf:
            if not re.search(r'[.!?]$', buf):
                buf = re.sub(r'[,;:–—]+$', '', buf).strip() + '.'
            final_chunks.append(buf)

    # 4. Kiểm tra an toàn cuối cùng và chuẩn hóa đuôi câu
    cleaned_chunks = []
    for ch in final_chunks:
        ch = ch.strip()
        if not ch:
            continue
        # Chuẩn hóa đuôi câu luôn kết thúc bằng . ! ? (không kết thúc bằng dấu phẩy)
        if not re.search(r'[.!?]$', ch):
            ch = re.sub(r'[,;:–—]+$', '', ch).strip() + '.'
        cleaned_chunks.append(ch)

    return cleaned_chunks

def clean_and_normalize_wav(file_path: str, fade_ms: int = 15, target_peak_ratio: float = 0.92):
    """
    Khử triệt để tiếng rè/bụp ở đầu và cuối câu (Transient Onset Artifact) bằng Smooth S-curve Fade
    và chuẩn hóa âm lượng Peak Normalization về 92% chống vỡ/méo tiếng (clipping).
    """
    if not os.path.exists(file_path):
        return
    try:
        with wave.open(file_path, 'rb') as w:
            params = w.getparams()
            sample_rate = params.framerate
            n_channels = params.nchannels
            sampwidth = params.sampwidth
            n_frames = w.getnframes()
            if n_frames == 0 or sampwidth != 2:
                return
            raw = w.readframes(n_frames)

        total_samples = n_frames * n_channels
        fmt = f'<{total_samples}h'
        samples = list(struct.unpack(fmt, raw))
        if not samples:
            return

        # 1. Smooth Fade-in ở đầu (fade_ms) - triệt tiêu 100% tiếng bụp/rè khi bắt đầu phát âm
        fade_samples = min(int(sample_rate * (fade_ms / 1000.0)) * n_channels, len(samples) // 4)
        if fade_samples > 0:
            for i in range(fade_samples):
                factor = (1.0 - math.cos(math.pi * i / fade_samples)) / 2.0
                samples[i] = int(samples[i] * factor)

        # 2. Smooth Fade-out ở cuối (fade_ms)
        if fade_samples > 0:
            for i in range(fade_samples):
                idx = len(samples) - 1 - i
                factor = (1.0 - math.cos(math.pi * i / fade_samples)) / 2.0
                samples[idx] = int(samples[idx] * factor)

        # 3. Peak Normalization về 92% biên độ tối đa chống méo tiếng / clipping
        max_amp = max(abs(s) for s in samples)
        if max_amp > 0:
            target_amp = int(32767 * target_peak_ratio)
            if max_amp > target_amp or max_amp < 18000:
                scale = target_amp / float(max_amp)
                samples = [max(-32768, min(32767, int(s * scale))) for s in samples]

        cleaned_raw = struct.pack(fmt, *samples)
        with wave.open(file_path, 'wb') as w:
            w.setparams(params)
            w.writeframes(cleaned_raw)
    except Exception:
        pass

def combine_wav_files(wav_paths: list, output_path: str, pause_sec: float = 0.14):
    """Ghép nối nhiều tệp WAV với khoảng lặng tự nhiên 140ms giữa các câu và khử tiếng nổ ở mối nối."""
    if not wav_paths:
        return
    if len(wav_paths) == 1:
        if wav_paths[0] != output_path:
            import shutil
            shutil.copyfile(wav_paths[0], output_path)
        clean_and_normalize_wav(output_path, fade_ms=15, target_peak_ratio=0.92)
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
            clean_and_normalize_wav(path, fade_ms=6, target_peak_ratio=0.92)
            with wave.open(path, 'rb') as in_wav:
                out_wav.writeframes(in_wav.readframes(in_wav.getnframes()))
            if i < len(wav_paths) - 1:
                out_wav.writeframes(silence_bytes)

    clean_and_normalize_wav(output_path, fade_ms=15, target_peak_ratio=0.92)

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
    speed: float = 1.12
    temperature: float = 0.55

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

        # Chuẩn hóa tiếng Việt thuần (chuyển chữ số và từ viết tắt sang tiếng Việt tự nhiên)
        normalized_text = normalize_vietnamese_text(request.text)

        # Phân đoạn thông minh (Smart Chunker): mỗi đoạn <= 240 ký tự giữ trọn vẹn câu
        chunks = smart_chunk_vietnamese_text(normalized_text, max_chars=240)
        if not chunks:
            chunks = [normalized_text]

        effective_speed = request.speed if (request.speed and request.speed > 0) else 1.12
        effective_temp = request.temperature if (request.temperature and request.temperature > 0) else 0.55

        logger.info(
            "Sinh âm thanh tiếng Việt thuần (%d chunks, Speed=%.2f, Temp=%.2f, SpeakerWav='%s')",
            len(chunks), effective_speed, effective_temp, speaker_wav_path
        )

        temp_chunk_files = []
        try:
            if len(chunks) == 1:
                tts_model.tts_to_file(
                    text=chunks[0],
                    speaker_wav=speaker_wav_path,
                    language=target_lang,
                    file_path=output_path,
                    speed=effective_speed,
                    split_sentences=False,
                    temperature=effective_temp,
                    repetition_penalty=1.85,
                    top_k=50,
                    top_p=0.82
                )
                clean_and_normalize_wav(output_path, fade_ms=15, target_peak_ratio=0.92)
            else:
                for idx, chunk in enumerate(chunks):
                    chunk_path = os.path.join(output_dir, f"chunk_{uuid.uuid4().hex[:8]}_{idx}.wav")
                    temp_chunk_files.append(chunk_path)
                    tts_model.tts_to_file(
                        text=chunk,
                        speaker_wav=speaker_wav_path,
                        language=target_lang,
                        file_path=chunk_path,
                        speed=effective_speed,
                        split_sentences=False,
                        temperature=effective_temp,
                        repetition_penalty=1.85,
                        top_k=50,
                        top_p=0.82
                    )
                combine_wav_files(temp_chunk_files, output_path, pause_sec=0.14)

            with open(output_path, "rb") as f:
                audio_bytes = f.read()

            return Response(content=audio_bytes, media_type="audio/wav")
        finally:
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            for tf in temp_chunk_files:
                if os.path.exists(tf):
                    try:
                        os.remove(tf)
                    except Exception:
                        pass

    except Exception as e:
        logger.error(f"Lỗi trong quá trình sinh giọng nói ViXTTS: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi sinh âm thanh ViXTTS: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
