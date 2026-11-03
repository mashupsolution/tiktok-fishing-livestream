# Thiết kế Hệ thống: TikTok Live RPC — Hồ Câu Cá Giải Trí Online

## 1. Mục tiêu
Xây dựng hệ thống phát trực tiếp tương tác (Interactive Live Stream) cho TikTok Live theo chủ đề **Hồ Câu Cá Sơn Thủy 2.5D (khung dọc 9:16)**. Người xem tương tác qua Bình luận, Thả tim, Chia sẻ/Follow, Tặng quà hoặc các lời gọi **JSON-RPC 2.0** để:
1. **Thả thính dụ cá** (Like / thả tim).
2. **Quăng cần, thả phao** và **giật cần bắt cá** kèm Thẻ Chiến Tích (loài cá, cân nặng, độ hiếm) và giọng đọc AI chúc mừng.
3. **Thổi còi báo cá** (Follow / Share) khiến đàn cá nhảy vọt khỏi mặt nước.
4. **Mồi thượng hạng / Đại chiến thủy quái** khi tặng quà, kéo lên cá cực phẩm và cá huyền thoại.
5. **Bảng Vàng Cần Thủ** xếp hạng theo tổng cân nặng và chiến tích trên 6 ghế câu ven hồ.

---

## 2. Kiến trúc Hệ thống

### 2.1. Thành phần
1. **Backend (`server.js`)**:
   - HTTP & Static Server (Express) phục vụ giao diện Live (`/`) và Bảng điều khiển Admin (`/admin`).
   - **JSON-RPC 2.0 Server** qua hai kênh:
     - HTTP `POST /rpc` (tích hợp TikFinity, Streamer.bot, curl, webhook).
     - WebSocket `ws://localhost:3000/ws` (đồng bộ thời gian thực giữa Server, màn hình OBS Live và Admin).
   - Endpoint phụ: `GET /api/state`, `GET /api/fish-catalog`.
   - **TikTok Live Connector Bridge**: dùng `tiktok-live-connector` (`TikTokLiveConnection`) lắng nghe `chat`, `like`, `gift`, `social`, `member` từ `@username` đang live.
   - **Fishing Engine**:
     - Quản lý hồ sơ cần thủ, điểm, tổng cá/cân nặng; lưu bền vững vào `data/fishing-state.json` (tự migrate từ `data/merit-state.json` cũ nếu có).
     - Danh mục cá theo 4 bậc hiếm (Tier 1–4; Tier 4 là Thủy Quái/Cá Rồng huyền thoại).
     - Phân tích bình luận tiếng Việt có/không dấu để kích hoạt hành động tương ứng.

2. **Màn hình Live 9:16 (`public/index.html`, `public/css/live.css`, `public/js/live.js`)**:
   - Khung `1080x1920` tự co giãn theo chiều cao màn hình hoặc chế độ OBS `?obs=1`.
   - Nền hồ nước (`assets/fishing_lake_bg.png`) và nhân vật cần thủ (`assets/angler_master.png`), phao câu, 6 ghế câu, Thẻ Chiến Tích và bảng vinh danh toàn màn hình khi bắt thủy quái.
   - **Canvas Particle Engine (`public/js/particles.js`)**: bong bóng nước, gợn sóng elip, giọt nước bắn, bóng cá; khóa 30 FPS, tạm dừng khi ẩn tab.
   - **Audio & ZeroTTS (`public/js/audio.js` + `tts_worker.py`)**: Web Audio API tổng hợp âm thanh nước, còi bến tàu, tiếng giật cần; ZeroTTS (`zeroweight-ai/ZeroTTS`, giọng `maichi`) chạy qua tiến trình Python thường trú, có cache WAV tại `data/tts-cache/` và fallback Web Speech API (`vi-VN`).

3. **Bảng Điều Khiển Admin (`public/admin.html`)**:
   - Kết nối / ngắt kết nối phòng TikTok Live `@username`.
   - Nút điều khiển nhanh cho từng hành động câu cá.
   - Chế độ **Auto-Sim** giả lập cần thủ để kiểm thử hoặc giữ nhiệt khi phòng vắng.
   - Nhật ký JSON-RPC 2.0 trực tiếp và quản lý Bảng Vàng.

---

## 3. Giao thức JSON-RPC 2.0

Mọi yêu cầu tới `POST /rpc` hoặc qua WebSocket tuân thủ JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "fishing.hookFish",
  "params": {
    "user": "Hải Đăng Cần Thủ",
    "uniqueId": "haidang99",
    "avatar": "",
    "wish": "Săn cá chép giòn 5 ký!"
  }
}
```

### Danh sách Methods
- `fishing.getState`: trạng thái hiện tại (tổng mồi, tổng cá, tổng cân nặng, Bảng Vàng, kết nối TikTok, cá đang kéo).
- `fishing.getLeaderboard`: Bảng Vàng cần thủ (`limit`, mặc định 6).
- `fishing.castBait`: thả thính dụ cá (`user`, `avatar`, `count` 1–50).
- `fishing.castRod`: quăng cần, thả phao (`user`, `avatar`).
- `fishing.hookFish`: giật cần, kéo cá ngẫu nhiên (`user`, `avatar`, `wish`).
- `fishing.soundHorn`: thổi còi báo cá (`user`, `avatar`).
- `fishing.catchBigFish`: mồi thượng hạng, cá Tier 2–3 (`user`, `avatar`, `coins`).
- `fishing.catchLeviathan`: đại chiến thủy quái, cá Tier 4 (`user`, `avatar`, `coins` ≥ 100).
- `fishing.setSettings`: cập nhật cấu hình âm thanh, TTS, chế độ tự động.
- `fishing.resetState`: đặt lại thống kê phiên live.
- `fishing.connectTikTok` / `fishing.disconnectTikTok`: kết nối / ngắt `@username` TikTok Live.
- `fishing.startAutoSim` / `fishing.stopAutoSim`: bật / tắt giả lập cần thủ trên server.
- `tts.synthesize` / `tts.status`: tổng hợp giọng đọc và kiểm tra trạng thái ZeroTTS.

> Tương thích ngược: các tên `temple.*` cũ vẫn được server chấp nhận làm alias nhưng không còn được khuyến nghị sử dụng.
