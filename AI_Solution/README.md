# MiniTwin · Đóng gói thông minh

Ứng dụng web gồm cửa hàng khách hàng và trạm đóng gói nhân viên. Khách hàng tạo đơn từ danh mục sản phẩm; đơn được đồng bộ sang hàng đợi nhân viên trong cùng trình duyệt. Nhân viên có thể phân tích carton, xem chi phí và hướng dẫn đóng gói, xử lý đơn cần nhiều kiện, xác nhận đóng gói, tra cứu lịch sử và tải CSV.

## Khởi chạy

JSON và JavaScript module cần được phục vụ qua HTTP. Trong PowerShell, mở thư mục dự án rồi chạy:

```powershell
py -m http.server 8000
```

Mở `http://localhost:8000/`, sau đó chọn **Khách hàng** hoặc **Nhân viên đóng gói**. Hai vai trò chia sẻ dữ liệu đơn bằng `localStorage` trong cùng trình duyệt.

## Cấu trúc

- `index.html`: chọn vai trò.
- `customer.html`, `js/customer.js`, `css/customer.css`: danh mục, giỏ hàng và tạo đơn.
- `product.html`, `js/product-detail.js`, `css/product-detail.css`: trang chi tiết sản phẩm, thông số, dung tích và khả năng lồng ghép.
- `staff.html`, `js/staff.js`, `css/staff.css`: hàng đợi, phân tích, xác nhận, lịch sử và CSV.
- `css/accessibility.css`: cỡ chữ, tương phản và giao diện ảnh sản phẩm.
- `js/algorithm.js`: lọc carton theo kích thước, thể tích, tải trọng và tồn kho; kiểm tra lồng ghép có điều kiện và lập phương án nhiều kiện.
- `js/data.js`: nạp JSON, lưu trạng thái và các tiện ích dữ liệu.
- `data/products.json`, `data/cartons.json`, `data/materials.json`: dữ liệu sản phẩm, carton và vật liệu/cước.

## Dữ liệu và giả định

Tên, ảnh và một số giá bán tham khảo được lấy từ cửa hàng Lock&Lock Việt Nam; giá bán có thể thay đổi. Ảnh sản phẩm dùng URL CDN của Lock&Lock nếu có; các ảnh còn lại là ảnh tham khảo sản phẩm cùng mẫu/dòng. Thông tin kích thước/khối lượng SKU và kích thước lòng trong của rổ là số liệu ước tính trong bộ dữ liệu này, cần được xác minh với mẫu hàng thực tế.

Mỗi SKU có các thuộc tính `isHollow`, `internalDimensions` và `allowNesting`. Ví dụ rổ LBW240W được đánh dấu là vật chứa rỗng, có lòng trong ước tính `31 × 23 × 15 cm`; bình LHC6180 có thể được lồng vào rổ khi một trong các hướng xoay vừa với kích thước lòng trong. Khi lồng thành công, thuật toán chỉ cộng thể tích bao ngoài của rổ vào tổng thể tích đóng gói, nhưng vẫn cộng khối lượng của cả rổ và bình. Đây là kiểm tra lồng một sản phẩm con vào mỗi vật chứa, không phải bộ giải xếp 3D.

Cước đang dùng tham số cấu hình 20.000 VND cho kiện đầu và 20.000 VND cho mỗi kiện thêm. Tổng cước theo kiện được lưu thành một khoản trên một mã đơn; việc chia kiện có thể tăng cước vì hãng vận chuyển có thể tạo vận đơn riêng cho từng kiện. Đây là ước tính để trình bày luồng, chưa kết nối API SPX hoặc Viettel Post và cần cập nhật theo tuyến, khối lượng, kích thước cùng chính sách hãng.

Thuật toán kiểm tra footprint/kê lớp và thể tích ước tính, không phải bộ giải xếp 3D. Hệ thống hiện chạy phía trình duyệt, chưa có xác thực tài khoản hay phân quyền máy chủ; `localStorage` chỉ đồng bộ trong cùng trình duyệt.
