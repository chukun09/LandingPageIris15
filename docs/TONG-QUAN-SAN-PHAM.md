# IRIS 15 — Tổng quan sản phẩm

> Landing page sự kiện kỷ niệm 15 năm thành lập IRIS.

## 1. Sản phẩm là gì?

IRIS 15 là trang web sự kiện nội bộ, nơi toàn thể CBNV cùng góp ảnh và lời chúc để
tạo nên **một bức tranh khảm kỷ niệm chung**. Bức tranh vừa hiển thị trực tuyến dạng
3D, vừa được xuất thành **file in khổ lớn làm backdrop** cho đêm Gala.

**Mục tiêu**
- Khơi gợi sự tham gia của mọi nhân viên trước ngày Gala.
- Lưu giữ kỷ niệm 15 năm dưới dạng số và bản in.
- Tạo điểm nhấn thị giác cho sân khấu Gala từ chính đóng góp của nhân viên.

## 2. Người dùng

| Nhóm | Nhu cầu chính |
|---|---|
| CBNV | Gửi kỷ niệm, xem bức tường chung, bình chọn, chia sẻ thẻ kỷ niệm |
| Ban tổ chức (Admin) | Duyệt nội dung, làm podcast, xuất file in backdrop |
| Khách dự Gala | Xem bức tranh khảm và nội dung trình chiếu tại sự kiện |

## 3. Tính năng cho CBNV

- **Gửi kỷ niệm ẩn danh:** tải ảnh (JPG, PNG, WebP) kèm lời chúc và phòng ban.
  Ảnh được kiểm tra nội dung thật và xử lý nền, người gửi không phải chờ.
- **Bức tường ký ức (Memory Wall):** hiển thị các kỷ niệm đã được duyệt.
- **Tranh khảm 3D:** mọi ảnh ghép thành một bức tranh lớn, bố cục tự thích ứng
  theo số lượng ảnh.
- **Thả tim bình chọn** cho kỷ niệm yêu thích.
- **Thẻ kỷ niệm để chia sẻ:** xuất ảnh 1080×1350 (chuẩn Story/Card) với viền vàng,
  lời chúc, phòng ban, ngày tháng và con dấu IRIS 15.
- **Nghe podcast** kỷ niệm ngay trên trang.

## 4. Không khí sự kiện

- **Đếm ngược** tới đêm Gala 15 năm.
- **Dòng thời gian** hành trình 15 năm của công ty.
- **Bảng xếp hạng phòng ban** theo số kỷ niệm đóng góp, tạo động lực thi đua.
- **Chế độ sân khấu (Gala Stage Mode)** để trình chiếu trên màn hình lớn.
- **Hiệu ứng ăn mừng:** pháo giấy, hạt vàng lấp lánh, ánh sáng bloom.

## 5. Công cụ cho Ban tổ chức

- **Duyệt bài:** xem danh sách chờ duyệt, duyệt để đưa lên bức tường.
- **Podcast Studio:**
  - Tạo podcast từ một kỷ niệm bằng giọng đọc AI: dùng Azure TTS nếu có API key,
    nếu không thì dùng ViXTTS tiếng Việt mặc định.
  - Hoặc tải file audio có sẵn lên.
- **Xuất backdrop in:** kiểm tra trước (preflight) → tạo lệnh render → xem thử →
  tải file in. Khung xem thử có dấu xén và thông số (số ô, khổ, DPI) như bản bông
  nhà in.
- Bố cục khảm trên web và trên file in dùng **chung một nguồn**, nên bản in khớp
  đúng với những gì mọi người thấy trên trang.

## 6. Trải nghiệm & chất lượng

- **Giao diện "Dark Gala"** sang trọng tông vàng kim, có nút chuyển sáng/tối.
- **Hiệu năng 3D thích ứng:** tự giảm hiệu ứng trên máy yếu, chỉ chạy 3D khi đang
  hiển thị trên màn hình.
- **An toàn ảnh tải lên:** kiểm tra định dạng theo nội dung file (không tin đuôi
  file), từ chối ảnh quá lớn (trên khoảng 50 MP) trước khi xử lý.
- **Tải nhanh:** bố cục và atlas ảnh được cache, trình duyệt chỉ tải lại khi có thay đổi.

## 7. Hành trình chính

1. Nhân viên mở trang → xem đếm ngược, bức tường và tranh khảm.
2. Gửi ảnh + lời chúc → Ban tổ chức duyệt → ảnh xuất hiện trên bức tường và tranh khảm.
3. Nhân viên thả tim, xuất thẻ kỷ niệm để chia sẻ; phòng ban đua top đóng góp.
4. Ban tổ chức chọn kỷ niệm hay để làm podcast.
5. Trước Gala: xuất file backdrop in khổ lớn từ tranh khảm.
6. Đêm Gala: bật chế độ sân khấu để trình chiếu.

## 8. Nền tảng (tóm tắt)

- Web: React 19, hiệu ứng 3D bằng Three.js.
- Máy chủ: ASP.NET Core (.NET 10), cơ sở dữ liệu SQLite (dev) / PostgreSQL (thật).
- Triển khai: Docker, có kiểm tra sức khỏe `/healthz`.
