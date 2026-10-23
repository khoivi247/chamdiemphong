# Sổ chấm điểm phòng ở ký túc xá

Ứng dụng bám theo mẫu Excel năm học 2026–2027: 34 phòng, 12 tiêu chí và 4 sheet nhóm phòng (01–08, 09–16, 17–24, 25–34). Điểm số chấp nhận giá trị từ 0 đến điểm tối đa; mục chưa chấm có thể nhập chữ, ví dụ `chưa chấm`. Mỗi lần lưu ghi toàn bộ 34 phòng sau bước xác nhận.

## Kiến trúc

- Giao diện tĩnh và file nguồn `style.css`, `script.js` được deploy trên Vercel.
- `api/gas.js` là API proxy trên Vercel. Nó giữ bí mật API và chuyển tiếp yêu cầu tới Google Apps Script; trình duyệt chỉ gọi `/api/gas`, nên không cần bật CORS trên Apps Script.
- `Code.gs` là backend Google Apps Script, xác thực yêu cầu proxy, áp dụng giờ khóa/ủy quyền, và đọc/ghi Google Sheets.

## 1. Tạo Google Sheet

1. Tạo Google Spreadsheet mới trong tài khoản Google sẽ sở hữu ứng dụng.
2. Sao chép ID giữa `/d/` và `/edit` trong URL bảng tính.
3. Tạo một Apps Script project độc lập, thêm `Code.gs`, rồi trong **Project Settings → Script Properties** tạo `SPREADSHEET_ID` với ID bảng tính. Chọn hàm `setupSheets` và nhấn **Run**; chấp thuận quyền truy cập Sheets. Hàm tạo 4 sheet nhóm phòng cùng hàng tiêu đề và không xóa dữ liệu sẵn có.

## 2. Deploy backend Apps Script

1. Trong Apps Script, bật hiển thị `appsscript.json` tại **Project Settings** rồi thêm manifest từ repository.
2. Trong **Project Settings → Script Properties**, giữ `SPREADSHEET_ID` đã cấu hình ở bước tạo sheet và thêm:
   - `UNLOCK_KEY`: key ủy quyền mở giao diện.
   - `GAS_API_SECRET`: chuỗi ngẫu nhiên dài làm bí mật giữa Vercel và Apps Script. Tạo cùng giá trị để dùng làm biến môi trường trên Vercel; không đưa giá trị này vào frontend, Git hoặc chia sẻ với giáo viên.
3. Chạy `setupSheets` nếu chưa tạo sheet.
4. Chọn **Deploy → New deployment → Web app**; đặt **Execute as: Me** và **Who has access: Anyone**. Đây là endpoint backend được Vercel gọi; quyền truy cập Google Sheet vẫn thuộc tài khoản deploy. Không chia sẻ URL Apps Script cho giáo viên.
5. Sao chép URL Web App kết thúc bằng `/exec`.

`doPost(e)` cung cấp các API `getAppState`, `authorizeUnlock`, `saveScores`. Nó yêu cầu `GAS_API_SECRET` hợp lệ và không cho phép gọi `setupSheets` qua API công khai. Khi sửa backend, deploy phiên bản Apps Script mới.

## 3. Deploy giao diện và API proxy lên Vercel

1. Đưa repository lên GitHub và import repository đó từ Vercel.
2. `vercel.json` cấu hình lệnh build `node build-vercel.js`. Lệnh này tạo `public/index.html` cùng CSS/JS tĩnh; API serverless nằm ở `api/gas.js`.
3. Trong Vercel → **Project Settings → Environment Variables**, thêm:
   - `GAS_WEB_APP_URL`: URL Apps Script Web App `/exec`.
   - `GAS_API_SECRET`: chính xác cùng giá trị đã lưu trong Script Properties.
4. Chọn môi trường **Production** (và Preview nếu cần), lưu biến, rồi **Redeploy**. Mở domain Vercel và thử nhập/lưu một đợt kiểm tra.

Khi cập nhật giao diện, Vercel build từ `Index.html`, `style.css`, `script.js`. Khi cập nhật backend, sửa `Code.gs` trong Apps Script và deploy phiên bản mới; URL `/exec` thường giữ nguyên.

## Giờ nhập và ủy quyền

- Mở tự động theo múi giờ của spreadsheet: 06:00–07:00 và 14:30–16:00.
- Ngoài khung giờ, key được kiểm tra phía Apps Script; khi hợp lệ, phiên làm việc được mở tối đa 30 phút. Key sai hiển thị hướng dẫn liên hệ Khôi Vĩ 10A2.
- Các lần lưu đều được kiểm tra quyền ở phía máy chủ Apps Script. Bản nháp nhập dở lưu cục bộ trong trình duyệt trên thiết bị đang dùng; bản nháp bị xóa sau khi lưu thành công.
- Apps Script cache có giới hạn thời gian lưu. Sau khi đổi `UNLOCK_KEY`, hãy triển khai phiên bản mới và thông báo key mới cho người được ủy quyền.

Các sheet là dữ liệu dạng bảng, mỗi dòng tương ứng một phòng trong một tuần, gồm tuần, khoảng ngày, điểm từng tiêu chí, tổng điểm, ghi chú, người chấm, lãnh đạo trực, thời điểm lưu và mã lần chấm. Có thể lọc theo tuần/ngày hoặc xuất Google Sheets ra Excel/PDF để tổng hợp, in cuối năm.
