/**
 * Danh sách phòng ban / bộ phận chuẩn của công ty Iris Media.
 * Được dùng chung giữa form gửi lời chúc (UploadModal) và modal chỉnh sửa bài viết của BTC (AdminPanel).
 */
export const DEPARTMENTS = [
  'Hội đồng Quản trị',
  'Ban Tổng Giám đốc',
  'Phòng Kỹ thuật Vận hành',
  'Phòng Phát triển Phần mềm',
  'Phòng Sản phẩm',
  'Phòng Phát triển Kinh doanh',
  'Phòng Kinh doanh',
  'Văn phòng Hồ Chí Minh',
  'Phòng Đối soát Vận hành',
  'Phòng Chăm sóc Khách hàng',
  'Phòng Kế toán',
  'Phòng Hành chính Nhân sự',
] as const;

export type Department = typeof DEPARTMENTS[number];
