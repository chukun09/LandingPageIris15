# IRIS 15 — Hướng dẫn sử dụng cho Ban Tổ Chức

> Tài liệu mô tả các chức năng quản trị trong trang "Ban Tổ Chức - Quản Trị Sự Kiện" của IRIS 15.

## 1. Đăng nhập quản trị

- Mở trang landing page, bấm vào nút/icon mở bảng quản trị để hiện modal **"Xác thực Quản trị"**.
- Nhập mật khẩu quản lý sự kiện và bấm **Xác nhận**.
- Đăng nhập thành công sẽ cấp một phiên làm việc (token) có hiệu lực **7 ngày**, lưu trên trình duyệt. Sau 7 ngày hoặc khi xóa dữ liệu trình duyệt, cần đăng nhập lại.
- Mật khẩu sai sẽ hiện thông báo lỗi và khung nhập rung nhẹ để cảnh báo.

Sau khi đăng nhập, bảng quản trị có 3 module chính: **Quản Lý Kỷ Niệm**, **Radio Podcast AI**, **Bản In Backdrop**.

## 2. Module 1 — Quản Lý Kỷ Niệm

### 2.1. Tab "Bài chờ duyệt"

- Hiển thị danh sách bài viết (ảnh + lời chúc + phòng ban) nhân viên vừa gửi, chưa được duyệt.
- Mỗi dòng có 2 nút:
  - **Duyệt** — bài viết hiển thị công khai trên Memory Wall và tranh khảm.
  - **Xóa** — từ chối bài viết, xóa luôn khỏi cơ sở dữ liệu và file ảnh vật lý trên server (không khôi phục được).
- Khi danh sách trống, hệ thống báo "Tất cả bài viết đã được phê duyệt xong!".

### 2.2. Tab "Bài đã duyệt & Ghim"

- Xem toàn bộ bài đã duyệt, có ô tìm kiếm theo nội dung hoặc phòng ban.
- Mỗi bài hiển thị số lượt tim (vote) và trạng thái ghim.
- **Ghim bài / Gỡ ghim**: bài được ghim sẽ luôn ưu tiên hiển thị ở đầu danh sách ký ức — dùng để tôn vinh những kỷ niệm nổi bật (lời chúc Ban Lãnh Đạo, khoảnh khắc đặc biệt...).
- Nút thùng rác: gỡ duyệt và xóa hẳn bài viết (kể cả đang ghim).

## 3. Module 2 — Radio Podcast AI

Mục tiêu: chuyển một kỷ niệm đã duyệt thành một số phát thanh (audio) để phát trên trang hoặc tại sự kiện.

### 3.1. Sub-tab "Studio Tạo Mới"

- Panel bên trái liệt kê **tất cả bài viết đã duyệt**. Bài đã có Radio sẽ bị mờ đi và không chọn lại được — **mỗi bài viết chỉ tạo đúng một số Radio duy nhất**.
- Chọn một bài để mở bảng tạo ở panel phải, có 2 chế độ:

**Chế độ 1 — Tạo Tự Động Bằng AI (TTS):**
1. Hệ thống tự điền sẵn tiêu đề (có thể sửa lại).
2. Có thể bấm **"⚡ Khởi động GPU (Warm-up)"** trước để đánh thức container ViXTTS (giọng đọc AI tiếng Việt mặc định) — tránh bị timeout khi tạo podcast nếu GPU đang ở trạng thái ngủ.
3. Mục "Cấu hình Azure Speech API (Tùy chọn)": nếu để trống, hệ thống tự dùng **ViXTTS** (giọng AI tiếng Việt chạy local/GPU); nếu điền API Key + Region của Azure, hệ thống dùng **Azure Speech** thay thế.
4. Bấm **"Khởi Tạo Podcast AI"** để chuyển lời chúc thành giọng đọc.

**Chế độ 2 — Tải Lên File Âm Thanh:**
1. Nhập tiêu đề số phát thanh.
2. Chọn file âm thanh có sẵn (.mp3, .wav, .m4a, .aac, .ogg — tối đa 50MB), có thể nghe thử trước khi tải lên.
3. Có thể gắn kèm với một bài viết cụ thể hoặc để độc lập (không bắt buộc chọn bài).
4. Bấm **"Tải Lên & Xuất Bản Radio"**.

### 3.2. Sub-tab "Kho Phát Thanh"

- Danh sách tất cả số Radio đã tạo: tiêu đề, thời lượng thực tế, ngày tạo.
- Nút **Tải xuống** (file MP3) và **Xóa** (xóa khỏi CSDL và file vật lý — không khôi phục được) cho từng số.

### 3.3. Sub-tab "Cấu Hình Voice & API"

- Nơi lưu sẵn **Azure Speech API Key** và **Region** để không phải nhập lại mỗi lần tạo podcast (lưu trên trình duyệt của người quản trị, không lưu trên server).
- Mặc định hệ thống dùng ViXTTS với cơ chế tự động chuyển sang Azure nếu ViXTTS không khả dụng (Auto-Fallback).

## 4. Module 3 — Bản In Backdrop

Dùng để xuất file đồ họa in ấn khổ lớn (mặc định **6m × 3m**, ~45 DPI, canvas khoảng 10.630×5.315 px) ghép từ đúng bố cục tranh khảm đang hiển thị trên trang, phục vụ thi công backdrop sân khấu Gala.

### 4.1. Quy trình xuất file

1. Từ tab "Bản In Backdrop", bấm **"Mở Trình Quản Lý & Xuất File In Bông"** để mở cửa sổ chi tiết.
2. Hệ thống tự ước lượng trước (preflight): kích thước khổ in, DPI, số điểm ảnh, bộ nhớ ước tính, và cảnh báo nếu có ảnh độ phân giải quá thấp so với ô được gán trong bố cục.
3. Chọn **nền in**: "Nền tối" (dùng cho phông sân khấu) hoặc "Nền giấy" (dùng cho backdrop chụp ảnh) — hai bản được lưu cache riêng biệt.
4. **Nếu hệ thống phát hiện đã có bản in cũ** khớp hoặc gần khớp bố cục hiện tại, sẽ hiện lựa chọn:
   - **"Dùng bản in cũ này"** — xem/tải ngay, không tốn thời gian dựng lại.
   - **"Xuất file mới (Dựng lại)"** — dựng lại từ đầu, dùng khi vừa có thêm nhiều ảnh mới được duyệt.
5. Nếu chưa có bản nào, bấm **"Dựng file in"** để bắt đầu — quá trình chạy ngầm, có thanh tiến độ hiển thị từng giai đoạn.
6. Khi hoàn tất, xem ảnh preview (JPEG nhẹ, cạnh dài 2500px) ngay trên trình duyệt, có thể phóng to/thu nhỏ.
7. Bấm **"Tải file in"** để tải file gốc độ phân giải đầy đủ (JPEG/PNG/TIFF tùy cấu hình máy chủ) dùng cho nhà in.

### 4.2. Lưu ý vận hành

- **Cảnh báo ảnh thiếu nét**: nếu một số ảnh có độ phân giải gốc thấp hơn yêu cầu của ô được gán, hệ thống liệt kê rõ từng ảnh (theo mã bài viết) để Ban tổ chức cân nhắc thay ảnh chất lượng cao hơn trước khi in.
- **Giới hạn bộ nhớ máy chủ**: có trần bảo vệ 80 triệu điểm ảnh (MPx); nếu khổ/DPI yêu cầu vượt trần, hệ thống báo lỗi và gợi ý hạ DPI hoặc hạ kích thước.
- Nên **chốt danh sách ảnh duyệt trước khi dựng bản in cuối cùng** gửi nhà in, vì dựng lại sau khi có thêm ảnh mới sẽ thay đổi bố cục.
