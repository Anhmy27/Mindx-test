# DevPort

Công cụ local giúp quản lý process đang chiếm port trên Windows — xem, kill, stop Docker, và lưu snapshot để chạy lại nhanh.

## Vấn đề

Khi chạy nhiều service local (Node, Docker, DB…), port dễ bị chiếm. Mỗi lần xử lý thường phải: mở terminal → `netstat` → tìm PID → `taskkill` / `docker stop`. Lặp lại nhiều lần mỗi ngày, dễ nhầm.

## Giải pháp

DevPort là web app cá nhân:

- Liệt kê process đang **listen** port
- Search / sort / kill (một hoặc nhiều)
- Stop Docker container đúng cách (`docker stop`), không kill relay kiểu `wslrelay`
- Snapshot: lưu nhóm process → Run / Restart lại (có thể kèm script, vd. `npm run dev`)
- Bảo vệ system process (chỉ xem, không kill)

## Stack

| | |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | Node + Express + TypeScript |
| OS / Docker | PowerShell, `taskkill`, `docker inspect/start/stop` |
| Lưu snapshot | File JSON trong `backend/Snapshot` |

Chạy local (`127.0.0.1`), không dùng database / auth. Frontend chỉ gọi API — không chạy lệnh OS.

## Cách hoạt động (ngắn)

1. Backend lấy TCP/UDP đang listen qua PowerShell, gắn thêm thông tin Docker nếu có.
2. Kill process Windows bằng `taskkill`; nếu row map được container thì gọi `docker stop`.
3. Snapshot lưu exe / command / cwd / script (hoặc `containerId`). Khi Run: ưu tiên script → không có thì replay command → Docker thì `docker start`.
4. Kiểm tra “đang chạy” không chỉ theo port (tránh nhầm app khác cùng cổng): Docker theo `containerId`, process theo exe + thư mục / dấu hiệu project.

## Chạy project

```bash
# Terminal 1
cd backend && npm install && npm run dev
# http://127.0.0.1:4000

# Terminal 2
cd frontend && npm install && npm run dev
# http://localhost:5173
```

## Reflection

DevPort rút ngắn thao tác kiểm tra/giải phóng port và dựng lại môi trường local quen thuộc, đồng thời phân biệt rõ process Windows với Docker. Đây là prototype 3 ngày trên Windows — đủ dùng hằng ngày và demo được bài toán automation trong workflow của engineer.
