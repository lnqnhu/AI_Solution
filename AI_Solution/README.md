# MiniTwin Demo

Prototype web hai vai trò cho bài toán lựa chọn carton bằng Constraint Optimization.

## Chạy demo

JSON và JavaScript module cần được phục vụ qua HTTP. Trong PowerShell, mở thư mục dự án rồi chạy:

```powershell
py -m http.server 8000
```

Mở `http://localhost:8000/` trên trình duyệt. Chọn **Khách hàng** để tạo đơn; mở **Nhân viên đóng gói** để nhận và phân tích đơn. Hai màn hình trao đổi dữ liệu bằng `localStorage` trong cùng trình duyệt.

## Cấu trúc

- `index.html`: trang chọn vai trò.
- `customer.html`, `js/customer.js`, `css/customer.css`: storefront, giỏ hàng và tạo đơn.
- `staff.html`, `js/staff.js`, `css/staff.css`: packing station, hàng đợi, phân tích, ghi đè và xác nhận đóng gói.
- `js/algorithm.js`: lọc phương án không khả thi theo kích thước ước tính, thể tích, tải trọng và tồn kho; tối thiểu hóa tổng chi phí các carton còn lại.
- `js/data.js`: nạp JSON, lưu trạng thái demo và hàm tiện ích.
- `data/products.json`, `data/cartons.json`, `data/materials.json`: dữ liệu đầu vào mô phỏng.

## Phạm vi mô phỏng

Thông số SKU, giá thùng, tồn kho, vật liệu và phí vận chuyển là dữ liệu demo, không phải dữ liệu nội bộ Lock&Lock. Kích thước được kiểm tra bằng ước tính footprint/kê lớp và thể tích tổng, không phải bộ giải xếp 3D. Vai trò chỉ tách giao diện; prototype chưa có xác thực tài khoản hoặc phân quyền bảo mật phía máy chủ. Trạng thái demo nằm trong `localStorage` của trình duyệt.
