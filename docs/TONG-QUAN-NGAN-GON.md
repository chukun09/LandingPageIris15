# IRIS 15 — Tóm tắt ngắn gọn

## ❓ Sản phẩm là gì?
Landing page sự kiện 15 năm IRIS — nhân viên gửi ảnh + lời chúc ghép thành **bức tranh khảm 3D**, vừa hiển thị online vừa in backdrop cho Gala.

## 👥 3 nhóm người dùng
1. **CBNV**: Gửi ảnh, xem bức tường kỷ niệm, thả tim, xuất thẻ chia sẻ
2. **Admin**: Duyệt nội dung, làm podcast, xuất file in
3. **Khách Gala**: Xem bức tranh và chế độ trình chiếu

## 🎯 Tính năng chính
- **Gửi kỷ niệm ẩn danh**: upload ảnh (JPG/PNG/WebP) + lời chúc + phòng ban
- **Memory Wall**: bức tường kỷ niệm được duyệt
- **Tranh khảm 3D**: ảnh ghép thành một bức tranh lớn, bố cục tự thích ứng
- **Thả tim bình chọn**: vote kỷ niệm yêu thích
- **Thẻ kỷ niệm**: xuất 1080×1350px (chuẩn Story/Card) với viền vàng + con dấu IRIS 15
- **Podcast**: nghe kỷ niệm được chuyển thành audio (Azure TTS hoặc ViXTTS)

## 🎭 Không khí sự kiện
- Đếm ngược tới Gala
- Dòng thời gian 15 năm công ty
- Bảng xếp hạng phòng ban (tạo động lực thi đua)
- Chế độ sân khấu để trình chiếu màn hình lớn
- Hiệu ứng ăn mừng (pháo giấy, hạt vàng, bloom light)

## 🛠️ Công cụ Admin
- **Duyệt bài**: danh sách chờ duyệt → đưa lên bức tường
- **Podcast Studio**: tạo từ kỷ niệm (AI voice) hoặc upload audio
- **Xuất backdrop in**: kiểm tra trước → render → tải file

## 🎨 Trải nghiệm
- **Giao diện Dark Gala**: tông vàng kim sang trọng, toggle sáng/tối
- **Hiệu năng 3D thích ứng**: tự giảm hiệu ứng trên máy yếu
- **An toàn upload**: kiểm tra định dạng file, từ chối ảnh quá lớn (>50 MP)
- **Tải nhanh**: cache bố cục & atlas, chỉ tải lại khi có thay đổi

## 🔧 Stack
- **Frontend**: React 19 + Three.js (3D)
- **Backend**: ASP.NET Core .NET 10
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Deploy**: Docker + health check `/healthz`

## 📖 Hành trình
1. Nhân viên mở trang → xem đếm ngược + tranh khảm
2. Gửi ảnh + lời chúc → admin duyệt → xuất hiện trên tường & tranh
3. Nhân viên thả tim, xuất thẻ chia sẻ
4. Admin chọn kỷ niệm hay làm podcast
5. Xuất file backdrop in khổ lớn (trước Gala)
6. Trình chiếu chế độ sân khấu đêm Gala
