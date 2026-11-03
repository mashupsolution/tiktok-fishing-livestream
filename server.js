const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

// Bắt lỗi toàn cục để tránh sập server khi WebSocket hoặc kết nối bên ngoài bị ngắt đột ngột
process.on('uncaughtException', (err) => {
  console.warn('[Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process UnhandledRejection]', reason?.message || reason);
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'fishing-state.json');
const LEGACY_STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BÁCH KHOA CÁ & THỦY QUÁI (FISH CATALOG)
// ============================================================================
const FISH_CATALOG = [
  // Tier 1: Phổ Thông (Common - Tỉ lệ xuất hiện cao)
  {
    id: 'bong_cat',
    name: 'Cá Bống Cát',
    species: 'Glossogobius giuris',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.2,
    maxWeight: 0.6,
    points: 10,
    badgeColor: '#546e7a',
    gradient: 'linear-gradient(135deg, #78909c 0%, #455a64 100%)',
    quote: 'Bống bống bang bang, bé hạt tiêu nhưng thịt thơm ngọt lịm!',
    icon: '🐟',
    ttsSummary: 'Cá Bống Cát tươi rói! Bé hạt tiêu nhưng mở hàng siêu may mắn!'
  },
  {
    id: 'ro_dong',
    name: 'Cá Rô Đồng',
    species: 'Anabas testudineus',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 0.3,
    maxWeight: 0.9,
    points: 12,
    badgeColor: '#558b2f',
    gradient: 'linear-gradient(135deg, #7cb342 0%, #33691e 100%)',
    quote: 'Rô đồng béo múp, vây giương oai vệ, đặc sản đồng quê!',
    icon: '🐟',
    ttsSummary: 'Cá Rô Đồng béo mầm, vây giương oai vệ đặc sản đồng quê!'
  },
  {
    id: 'me_hoa',
    name: 'Cá Mè Hoa',
    species: 'Hypophthalmichthys nobilis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.2,
    maxWeight: 2.8,
    points: 15,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #00acc1 0%, #006064 100%)',
    quote: 'Mè hoa lượn sóng đầm lầy, đầu to béo ngậy!',
    icon: '🐟',
    ttsSummary: 'Cá Mè Hoa lượn sóng đầm lầy, kéo máy câu ríu rít!'
  },
  {
    id: 'troi_den',
    name: 'Cá Trôi Đen',
    species: 'Cirrhinus microlepis',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.5,
    maxWeight: 3.5,
    points: 18,
    badgeColor: '#37474f',
    gradient: 'linear-gradient(135deg, #607d8b 0%, #263238 100%)',
    quote: 'Trôi cắn câu phóng như tàu lượn, ghì máy câu kêu ràn rạt!',
    icon: '🐟',
    ttsSummary: 'Cá Trôi Đen lực lưỡng phóng như tàu lượn xé toạc mặt nước!'
  },
  {
    id: 'tai_tuong',
    name: 'Cá Tai Tượng',
    species: 'Osphronemus goramy',
    rarity: 'Phổ Thông',
    tier: 1,
    minWeight: 1.0,
    maxWeight: 2.6,
    points: 16,
    badgeColor: '#6d4c41',
    gradient: 'linear-gradient(135deg, #8d6e63 0%, #4e342e 100%)',
    quote: 'Tai tượng vảy xòe như quạt ba tiêu, giật cực đã tay!',
    icon: '🐟',
    ttsSummary: 'Cá Tai Tượng vảy xòe như cánh quạt, giật cực đã tay!'
  },

  // Tier 2: Quý Hiếm (Rare)
  {
    id: 'chep_vang',
    name: 'Cá Chép Vàng Cát Tường',
    species: 'Cyprinus carpio aureate',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.5,
    maxWeight: 5.8,
    points: 35,
    badgeColor: '#f9a825',
    gradient: 'linear-gradient(135deg, #ffd54f 0%, #f57f17 100%)',
    quote: 'Chép vàng vượt vũ môn hóa rồng, rước đại cát đại lợi về nhà!',
    icon: '🐠',
    ttsSummary: 'Cá Chép Vàng Cát Tường! Vượt vũ môn hóa rồng mang đại cát đại lợi!'
  },
  {
    id: 'tra_khung',
    name: 'Cá Tra Khủng',
    species: 'Pangasius hypophthalmus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 4.0,
    maxWeight: 9.8,
    points: 42,
    badgeColor: '#0277bd',
    gradient: 'linear-gradient(135deg, #29b6f6 0%, #01579b 100%)',
    quote: 'Cá tra béo tròn lủn cũn, quẫy đuôi làm sóng dạt đôi bờ!',
    icon: '🐟',
    ttsSummary: 'Cá Tra Khủng béo tròn, quẫy đuôi làm sóng dạt đôi bờ hồ câu!'
  },
  {
    id: 'lang_hoa',
    name: 'Cá Lăng Đốm Hoa',
    species: 'Hemibagrus guttatus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 3.2,
    maxWeight: 7.5,
    points: 48,
    badgeColor: '#6a1b9a',
    gradient: 'linear-gradient(135deg, #ab47bc 0%, #4a148c 100%)',
    quote: 'Đặc sản ghềnh thác sông sâu, kéo máy câu rít từng hồi!',
    icon: '🐡',
    ttsSummary: 'Cá Lăng Đốm Hoa quý hiếm, đặc sản ghềnh thác ghì cong ngọn cần!'
  },
  {
    id: 'chim_trang',
    name: 'Cá Chim Trắng Lưỡi Kiếm',
    species: 'Piaractus brachypomus',
    rarity: 'Quý Hiếm',
    tier: 2,
    minWeight: 2.8,
    maxWeight: 6.2,
    points: 40,
    badgeColor: '#00838f',
    gradient: 'linear-gradient(135deg, #26c6da 0%, #006064 100%)',
    quote: 'Tốc độ xé nước như tia chớp, hàm răng sắc bén như thép!',
    icon: '🐠',
    ttsSummary: 'Cá Chim Trắng tốc độ xé nước như tia chớp, giằng co gay cấn!'
  },

  // Tier 3: Cực Phẩm (Epic / Sát Thủ Đầm Lầy)
  {
    id: 'koi_cam_thach',
    name: 'Cá Koi Ngũ Sắc Hoàng Gia',
    species: 'Cyprinus rubrofuscus var.',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 5.5,
    maxWeight: 13.5,
    points: 85,
    badgeColor: '#d84315',
    gradient: 'linear-gradient(135deg, #ff7043 0%, #bf360c 100%)',
    quote: 'Tuyệt tác tạo hóa! Vảy ngũ sắc lấp lánh như ngọc lục bảo!',
    icon: '🪸',
    ttsSummary: 'Cực phẩm Cá Koi Ngũ Sắc Hoàng Gia! Vảy ngọc lung linh tuyệt mỹ!'
  },
  {
    id: 'tre_hoang_kim',
    name: 'Cá Trê Hoàng Kim Phát Quang',
    species: 'Clarias gariepinus albino',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 6.5,
    maxWeight: 15.0,
    points: 95,
    badgeColor: '#ef6c00',
    gradient: 'linear-gradient(135deg, #ffa726 0%, #e65100 100%)',
    quote: 'Trê vàng toàn thân rực ánh hoàng kim, vạn người ao ước!',
    icon: '✨',
    ttsSummary: 'Cực phẩm Cá Trê Hoàng Kim Đột Biến! Toàn thân phát quang lấp lánh!'
  },
  {
    id: 'tam_hoang_gia',
    name: 'Cá Tầm Hoàng Gia Hắc Ngự',
    species: 'Acipenser baerii',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 8.5,
    maxWeight: 19.5,
    points: 110,
    badgeColor: '#283593',
    gradient: 'linear-gradient(135deg, #5c6bc0 0%, #1a237e 100%)',
    quote: 'Hóa thạch sống sông Danube, vương giả của thế giới thủy sinh!',
    icon: '🦈',
    ttsSummary: 'Cực phẩm Cá Tầm Hoàng Gia Hắc Ngự! Vương giả uy phong ngời ngời!'
  },
  {
    id: 'channa_hoang_de',
    name: 'Cá Chuối Hoàng Đế (Channa)',
    species: 'Channa marulioides',
    rarity: 'Cực Phẩm',
    tier: 3,
    minWeight: 4.8,
    maxWeight: 12.0,
    points: 90,
    badgeColor: '#ad1457',
    gradient: 'linear-gradient(135deg, #ec407a 0%, #880e4f 100%)',
    quote: 'Chúa tể săn mồi đầm lầy, mắt rực lửa hoa văn rồng cuộn!',
    icon: '🐊',
    ttsSummary: 'Cực phẩm Cá Chuối Hoàng Đế! Chúa tể đầm lầy với hoa văn rồng cuộn!'
  },

  // Tier 4: Huyền Thoại (Mythic / Leviathan - Thủy Quái)
  {
    id: 'rong_kim_long',
    name: 'Cá Rồng Bối Đầu Vàng (Kim Long Quá Bối)',
    species: 'Scleropages formosus',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 18.0,
    maxWeight: 38.5,
    points: 280,
    badgeColor: '#ffb300',
    gradient: 'linear-gradient(135deg, #ffe082 0%, #ff8f00 100%)',
    quote: 'BẬC THẦY PHONG THỦY! Kim Long xuất hải, tài lộc vượng khí cuộn trào!',
    icon: '🐉',
    ttsSummary: 'HUYỀN THOẠI XUẤT HIỆN! Cá Rồng Kim Long Quá Bối xuất hải, tài lộc vượng khí ngập tràn!'
  },
  {
    id: 'thuy_quai_ho_sau',
    name: 'Thủy Quái Hồ Sâu (Cá Hô Khổng Lồ)',
    species: 'Catlocarpio siamensis',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 42.0,
    maxWeight: 96.0,
    points: 380,
    badgeColor: '#c62828',
    gradient: 'linear-gradient(135deg, #ef5350 0%, #b71c1c 100%)',
    quote: 'VUA CỦA CÁC LOÀI CÁ NƯỚC NGỌT! Cần câu cong vút cực hạn, bọt nước tung trời!',
    icon: '🐋',
    ttsSummary: 'THỦY QUÁI HỒ SÂU! Cá Hô Khổng Lồ kéo cong cần titan, cả bến thuyền cùng hò reo!'
  },
  {
    id: 'rua_than_ngoc',
    name: 'Cụ Rùa Vàng Thần Long',
    species: 'Cuora amboinensis aurea',
    rarity: 'Huyền Thoại',
    tier: 4,
    minWeight: 55.0,
    maxWeight: 99.9,
    points: 500,
    badgeColor: '#e65100',
    gradient: 'linear-gradient(135deg, #ffb74d 0%, #bf360c 100%)',
    quote: 'RÙA VÀNG BÁCH NIÊN! Ban phúc trường thọ trăm tuổi, gia đạo bình an phát tài!',
    icon: '🐢',
    ttsSummary: 'ĐẠI CÁT TƯỜNG! Cụ Rùa Vàng Thần Long nổi lên ban phúc trường thọ gia đạo an khang!'
  }
];

// ============================================================================
// 2. QUẢN LÝ TIẾN TRÌNH ZEROTTS (WORKER DAEMON)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.startWorker();
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    try {
      this.proc = spawn(pyBin, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleWorkerLine(line.trim());
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
      });

      this.proc.on('exit', (code) => {
        console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
        this.ready = false;
        this.status = 'stopped';
        for (const [, item] of this.pending) {
          clearTimeout(item.timer);
          item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
        }
        this.pending.clear();
      });

      this.proc.on('error', (err) => {
        console.warn('[ZeroTTS Spawn Error]', err.message);
      });
    } catch (e) {
      console.warn('[ZeroTTS] Không khởi chạy được:', e.message);
    }
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng! Giọng: ${this.voice}`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve({
            ok: true,
            url: `/data/tts-cache/${msg.filename}`,
            duration: msg.duration,
            elapsed: msg.elapsed,
            cached: !!msg.cached,
            voice: msg.voice || this.voice
          });
        }
      } else if (msg.type === 'error') {
        console.warn(`[ZeroTTS Error] ${msg.error}`);
        if (msg.id != null) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            pending.resolve({ ok: false, error: msg.error });
          }
        }
      }
    } catch (_) {}
  }

  synthesize(text, voice = 'maichi') {
    const clean = String(text || '').trim();
    if (!clean) return Promise.resolve({ ok: false, error: 'Nội dung rỗng' });

    if (!this.ready || !this.proc || this.proc.killed) {
      return Promise.resolve({
        ok: false,
        error: `ZeroTTS chưa sẵn sàng (trạng thái: ${this.status})`
      });
    }

    const id = ++this.reqCounter;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS timeout (18s)' });
      }, 18000);

      this.pending.set(id, { resolve, timer });
      try {
        this.proc.stdin.write(
          JSON.stringify({
            cmd: 'synth',
            id,
            text: clean,
            voice: voice || this.voice
          }) + '\n'
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      voice: this.voice,
      voices: this.voices,
      model: this.model,
      pendingCount: this.pending.size
    };
  }
}

// ============================================================================
// 3. TRẠNG THÁI HỒ CÂU & BẢNG VÀNG CẦN THỦ
// ============================================================================
const DEFAULT_STATE = {
  totalCatches: 48,
  totalWeightKg: 186.5,
  totalBait: 360,
  hornsBlown: 24,
  lakeCondition: 'Cá Đi Ăn Mạnh 🐟',
  activeFish: null,
  rodState: 'idle', // idle, casting, hooked, reeling, celebrating
  anglers: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    autoSim: false,
    autoSimIntervalMs: 8000
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function calculateAnglerTitle(totalWeightKg, catchesCount) {
  if (totalWeightKg >= 60 || catchesCount >= 20) return 'Vua Sát Cá Đại Dương 👑';
  if (totalWeightKg >= 30 || catchesCount >= 12) return 'Bá Chủ Đầm Lầy 🦈';
  if (totalWeightKg >= 15 || catchesCount >= 6) return 'Cần Thủ Chuyên Nghiệp 🐠';
  if (totalWeightKg >= 5 || catchesCount >= 3) return 'Tay Câu Cừ Khôi 🐟';
  return 'Cần Thủ Nhập Môn 🎣';
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        anglers: saved.anglers || {},
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    } else if (fs.existsSync(LEGACY_STATE_FILE)) {
      // Migrate from legacy temple state
      const legacy = JSON.parse(fs.readFileSync(LEGACY_STATE_FILE, 'utf8'));
      const migratedAnglers = {};
      if (legacy.devotees) {
        for (const [id, d] of Object.entries(legacy.devotees)) {
          const catches = Math.max(1, Math.floor((d.incense || 1)));
          const weight = +(catches * 2.8).toFixed(1);
          migratedAnglers[id] = {
            name: d.name,
            uniqueId: d.uniqueId || id,
            avatar: d.avatar || '',
            catchesCount: catches,
            totalWeightKg: weight,
            points: d.merit || 50,
            title: calculateAnglerTitle(weight, catches),
            lastWish: d.lastWish || 'Chúc hội cần thủ may mắn lên cá to!',
            bestCatch: { fishName: 'Cá Chép Vàng', weightKg: 4.8 }
          };
        }
      }
      return {
        ...DEFAULT_STATE,
        anglers: migratedAnglers
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được state, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalCatches: state.totalCatches,
      totalWeightKg: state.totalWeightKg,
      totalBait: state.totalBait,
      hornsBlown: state.hornsBlown,
      lakeCondition: state.lakeCondition,
      anglers: state.anglers,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.anglers)
    .sort((a, b) => (b.totalWeightKg || 0) - (a.totalWeightKg || 0) || (b.points || 0) - (a.points || 0))
    .slice(0, limit)
    .map((a, index) => ({
      rank: index + 1,
      name: a.name,
      uniqueId: a.uniqueId,
      avatar: a.avatar || '',
      totalWeightKg: a.totalWeightKg || 0,
      catchesCount: a.catchesCount || 0,
      points: a.points || 0,
      title: a.title || 'Cần Thủ Nhập Môn 🎣',
      bestCatch: a.bestCatch || null,
      lastWish: a.lastWish || ''
    }));
}

// Bộ lọc an toàn ký tự & spam
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|lừa à|telegram)/i;

function isBlockedSpamOrToxic(rawText) {
  if (!rawText) return true;
  if (WEIRD_SPAM_RE.test(rawText)) return true;
  if (BAD_WORDS_RE.test(rawText)) return true;
  return false;
}

function sanitizeWishText(raw) {
  if (!raw) return '';
  let text = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  text = text.replace(ALLOWED_VI_TEXT_RE, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 95) text = text.slice(0, 95).trim();
  return text;
}

function sanitizeUserName(raw) {
  if (!raw) return 'Cần Thủ Vô Danh';
  let name = String(raw).normalize('NFKC').replace(BRACKET_EMOTE_RE, ' ').trim();
  name = name.replace(ALLOWED_VI_NAME_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return 'Cần Thủ Ẩn Danh';
  if (name.length > 24) name = name.slice(0, 24).trim();
  return name;
}

function recordAngler(user, uniqueId, avatar, pointsGained = 10, weightGained = 0, catchesGained = 0, wish = '', caughtFish = null) {
  const key = uniqueId || user || `angler_${Date.now()}`;
  const existing = state.anglers[key] || {
    name: user || 'Cần Thủ',
    uniqueId: key,
    avatar: avatar || '',
    catchesCount: 0,
    totalWeightKg: 0,
    points: 0,
    title: 'Cần Thủ Nhập Môn 🎣',
    bestCatch: null,
    lastWish: ''
  };

  existing.name = user || existing.name;
  if (avatar) existing.avatar = avatar;
  existing.points += pointsGained;
  existing.catchesCount += catchesGained;
  existing.totalWeightKg = +(existing.totalWeightKg + weightGained).toFixed(1);
  existing.title = calculateAnglerTitle(existing.totalWeightKg, existing.catchesCount);
  if (wish) existing.lastWish = wish;

  if (caughtFish) {
    if (!existing.bestCatch || (caughtFish.weightKg > (existing.bestCatch.weightKg || 0))) {
      existing.bestCatch = {
        fishName: caughtFish.name,
        weightKg: caughtFish.weightKg,
        rarity: caughtFish.rarity
      };
    }
  }

  state.anglers[key] = existing;
  return existing;
}

function pushEventLog(event) {
  const item = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...event
  };
  state.recentEvents.unshift(item);
  if (state.recentEvents.length > 40) {
    state.recentEvents.pop();
  }
  return item;
}

function getRandomFish(tierFilter = null) {
  let candidates = FISH_CATALOG;
  if (tierFilter != null) {
    candidates = FISH_CATALOG.filter((f) => f.tier === tierFilter);
  }
  if (!candidates.length) {
    // Weighted random distribution
    const roll = Math.random();
    if (roll < 0.60) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 1); // Common 60%
    } else if (roll < 0.85) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 2); // Rare 25%
    } else if (roll < 0.96) {
      candidates = FISH_CATALOG.filter((f) => f.tier === 3); // Epic 11%
    } else {
      candidates = FISH_CATALOG.filter((f) => f.tier === 4); // Mythic 4%
    }
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const weight = +(chosen.minWeight + Math.random() * (chosen.maxWeight - chosen.minWeight)).toFixed(1);
  return {
    ...chosen,
    weightKg: weight
  };
}

function getPublicState() {
  return {
    totalCatches: state.totalCatches,
    totalWeightKg: state.totalWeightKg,
    totalBait: state.totalBait,
    hornsBlown: state.hornsBlown,
    lakeCondition: state.lakeCondition,
    activeFish: state.activeFish,
    rodState: state.rodState,
    leaderboard: getLeaderboard(6),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok
  };
}

// ============================================================================
// 4. HÀNH ĐỘNG CÂU CÁ & TƯƠNG TÁC (FISHING ENGINE)
// ============================================================================
const FishingEngine = {
  // 1. Thả thính / Ném mồi dụ cá (Tương ứng Thả Tim)
  castBait(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const points = count;

    state.totalBait += count;
    const angler = recordAngler(user, uniqueId, avatar, points, 0, 0);

    const event = pushEventLog({
      type: 'castBait',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      count,
      points,
      title: angler.title,
      ttsText: params.readTts ? `Cần thủ ${angler.name} vừa thả ${count} nắm thính thơm dụ cá!` : ''
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 2. Quăng cần / Thả phao chờ cá cắn
  castRod(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Quăng cần thả phao, cầu hôm nay giỏ đầy ắp cá!';
    const points = 5;

    state.rodState = 'casting';
    const angler = recordAngler(user, uniqueId, avatar, points, 0, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Cần thủ ${angler.name} vung cần quăng phao ra giữa hồ: ${wish}.`;

    const event = pushEventLog({
      type: 'castRod',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 3. Giật cần / Bắt cá (Hook Fish)
  hookFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Giật cần lên cá to!';
    const tierOverride = params.tierOverride != null ? Number(params.tierOverride) : null;
    const caughtFish = getRandomFish(tierOverride);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'hooked';

    const points = caughtFish.points;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, wish, caughtFish);

    const ttsText = params.readTts === false
      ? ''
      : `Chúc mừng cần thủ ${angler.name} vừa giật cần bắt được ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote}`;

    const event = pushEventLog({
      type: 'hookFish',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      wish,
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 4. Thổi còi bến thuyền / Báo cá cắn câu (Tương ứng Follow / Share)
  soundHorn(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Báo cá! Báo cá! Chúc cả bến thuyền cùng bội thu!';
    const points = 15;

    state.hornsBlown += 1;
    const angler = recordAngler(user, uniqueId, avatar, points, 0, 0, wish);

    const ttsText = params.readTts
      ? `Cần thủ ${angler.name} thổi còi báo cá rộn rã toàn hồ: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'soundHorn',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      points,
      wish,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 5. Mồi Thượng Hạng (Quà Vừa: 5-99 xu) -> Chắc chắn bắt cá Quý Hiếm hoặc Cực Phẩm
  catchBigFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(5, Number(params.coins) || 20);
    const tier = coins >= 30 ? 3 : 2;
    const caughtFish = getRandomFish(tier);

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';

    const points = coins * 15;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Dâng Mồi Thượng Hạng', caughtFish);

    const ttsText = params.readTts === false
      ? ''
      : `Đại cần thủ ${angler.name} dùng mồi câu thượng hạng, giật vút lên ${caughtFish.name} nặng ${caughtFish.weightKg} ký! Cả bến thuyền cùng chúc mừng!`;

    const event = pushEventLog({
      type: 'catchBigFish',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Mồi Thượng Hạng',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  // 6. Đại Chiến Thủy Quái (Quà Lớn: >= 100 xu) -> Cá Rồng Kim Long hoặc Thủy Quái Hồ Sâu
  catchLeviathan(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(100, Number(params.coins) || 199);
    const caughtFish = getRandomFish(4); // Mythic Tier 4

    state.totalCatches += 1;
    state.totalWeightKg = +(state.totalWeightKg + caughtFish.weightKg).toFixed(1);
    state.activeFish = caughtFish;
    state.rodState = 'celebrating';
    state.lakeCondition = 'Đại Tiệc Thủy Quái 🐉';

    const points = coins * 30;
    const angler = recordAngler(user, uniqueId, avatar, points, caughtFish.weightKg, 1, params.giftName || 'Đại Lễ Săn Thủy Quái', caughtFish);

    const ttsText = params.readTts === false
      ? ''
      : `CHẤN ĐỘNG HỒ CÂU! Đại cao thủ ${angler.name} vừa bắt được huyền thoại ${caughtFish.name} nặng ${caughtFish.weightKg} ký! ${caughtFish.quote}`;

    const event = pushEventLog({
      type: 'catchLeviathan',
      user: angler.name,
      uniqueId: angler.uniqueId,
      avatar: angler.avatar,
      coins,
      giftName: params.giftName || 'Cá Rồng Kim Long',
      fish: caughtFish,
      weightKg: caughtFish.weightKg,
      points,
      title: angler.title,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('fishing.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  },

  resetState() {
    state.totalCatches = 0;
    state.totalWeightKg = 0;
    state.totalBait = 0;
    state.hornsBlown = 0;
    state.lakeCondition = 'Nước Tĩnh Lặng 🌊';
    state.activeFish = null;
    state.rodState = 'idle';
    state.anglers = {};
    state.recentEvents = [];
    saveState();
    broadcastNotification('fishing.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;
const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) return null;

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 2) return null;

  // Chống spam (cooldown 3.5s / người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) return null;
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. Thả thính / Mồi
  if (lower.includes('thả thính') || lower.includes('tha thinh') || lower.includes('mồi') || lower.includes('moi') || lower.includes('thính')) {
    return FishingEngine.castBait({ user: cleanUser, uniqueId, avatar, count: 5 });
  }

  // 2. Thổi còi / Báo cá
  if (lower.includes('thổi còi') || lower.includes('thoi coi') || lower.includes('báo cá') || lower.includes('bao ca') || lower.includes('còi') || lower.includes('coi')) {
    return FishingEngine.soundHorn({ user: cleanUser, uniqueId, avatar, wish: cleanWish, readTts: true });
  }

  // 3. Thủy quái / Cá Rồng / Kim Long
  if (lower.includes('thủy quái') || lower.includes('thuy quai') || lower.includes('cá rồng') || lower.includes('ca rong') || lower.includes('kim long')) {
    return FishingEngine.hookFish({ user: cleanUser, uniqueId, avatar, wish: cleanWish, tierOverride: Math.random() < 0.4 ? 4 : 3, readTts: true });
  }

  // 4. Giật cần / Lên cá / Bắt cá / Câu cá
  if (
    lower.includes('giật') ||
    lower.includes('giat') ||
    lower.includes('lên cá') ||
    lower.includes('len ca') ||
    lower.includes('bắt cá') ||
    lower.includes('bat ca') ||
    lower.includes('cắn câu') ||
    lower.includes('can cau') ||
    lower.includes('câu cá') ||
    lower.includes('cau ca') ||
    lower.includes('quăng cần') ||
    lower.includes('quang can') ||
    lower.includes('thả câu') ||
    lower.includes('cá to') ||
    lower.includes('ca to')
  ) {
    return FishingEngine.hookFish({ user: cleanUser, uniqueId, avatar, wish: cleanWish, readTts: true });
  }

  // 5. Bình luận chào hỏi / chúc may mắn -> Cho thử vận may giật một mẻ cá
  return FishingEngine.hookFish({ user: cleanUser, uniqueId, avatar, wish: cleanWish, readTts: true });
}

function extractUserFromEvent(data) {
  const user = data?.nickname || data?.uniqueId || data?.user?.nickname || data?.user?.uniqueId || 'Cần Thủ';
  const uniqueId = data?.uniqueId || data?.user?.uniqueId || '';
  const avatar = data?.profilePictureUrl || data?.user?.profilePictureUrls?.[0] || '';
  return { user, uniqueId, avatar };
}

async function resolveTikTokUsername(input) {
  if (!input) return null;
  let str = String(input).trim();
  const atMatch = str.match(/@([a-zA-Z0-9_.-]+)/);
  if (atMatch) return atMatch[1];
  const urlMatch = str.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
  if (urlMatch) return urlMatch[1];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('fishing.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  // Bảo vệ wsClient khỏi emit error không có listener sau khi đóng kết nối
  tiktokConn.on(ControlEvent.WEBSOCKET_CONNECTED, (wsClient) => {
    if (wsClient && typeof wsClient.on === 'function') {
      wsClient.on('error', (err) => {
        console.warn('[TikTok Live WS Error]', err?.message || err);
      });
      const origRemoveAll = wsClient.removeAllListeners.bind(wsClient);
      wsClient.removeAllListeners = function (event) {
        origRemoveAll(event);
        this.on('error', () => {});
        return this;
      };
    }
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối hồ câu @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    const errMsg = err?.exception?.message || err?.info || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    state.tiktok.lastError = errMsg;
    console.warn('[TikTok Live Warning]', errMsg);
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('fishing.viewerCount', { viewerCount });
    }
  });

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordAngler(user, uniqueId, avatar, 1, 0, 0, 'Đã vào hồ câu cá');
    broadcastNotification('fishing.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    FishingEngine.castBait({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    FishingEngine.soundHorn({
      user,
      uniqueId,
      avatar,
      wish: 'Hữu duyên tương ngộ nơi hồ câu, chúc buông cần thắng lợi!',
      readTts: false
    });
  };

  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const text = String(data?.label || '').toLowerCase();
    if (text.includes('follow') || text.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftName = data?.giftName || data?.name || 'Quà Tặng Hồ Câu';
    const diamondCount = Number(data?.diamondCount || 0);
    const repeatCount = Number(data?.repeatCount || 1);
    const totalCoins = Math.max(1, diamondCount * repeatCount);

    console.log(`[TikTok Gift] ${user} tặng ${giftName} (${totalCoins} xu)`);

    if (totalCoins >= 100) {
      FishingEngine.catchLeviathan({
        user,
        uniqueId,
        avatar,
        coins: totalCoins,
        giftName,
        readTts: true
      });
    } else if (totalCoins >= 5) {
      FishingEngine.catchBigFish({
        user,
        uniqueId,
        avatar,
        coins: totalCoins,
        giftName,
        readTts: true
      });
    } else {
      FishingEngine.hookFish({
        user,
        uniqueId,
        avatar,
        tierOverride: 2,
        wish: `Tặng ${giftName} lấy may!`,
        readTts: true
      });
    }
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('fishing.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('fishing.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('fishing.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (GIẢ LẬP CẦN THỦ TƯƠNG TÁC)
// ============================================================================
let autoSimTimer = null;
const SIM_ANGLERS = [
  { user: 'Hải Đăng Cần Thủ', uniqueId: 'haidang.angler', wish: 'Thả mồi trùn quế, săn chú cá chép vàng 5 ký!' },
  { user: 'Trần Tuấn Sát Cá', uniqueId: 'tuancauca_99', wish: 'Quyết tâm giật con cá tra khủng phá kỷ lục hồ câu!' },
  { user: 'Bích Thảo Thư Thái', uniqueId: 'thao.lotus', wish: 'Em mới tập câu, xin một chú cá rô đồng xinh xinh lấy may ạ' },
  { user: 'Hoàng Long Cần Titan', uniqueId: 'long_titan_88', wish: 'Săn thủy quái hồ sâu, kéo cong vút cần titan!' },
  { user: 'Minh Quân Bến Thuyền', uniqueId: 'quan.river', wish: 'Chúc anh em cần thủ một ngày giỏ đầy ắp cá béo!' },
  { user: 'Diệu Hương Thư Giãn', uniqueId: 'huong_healing', wish: 'Ngồi câu cá ngắm mây trời thanh thản, chúc cả nhà bình an!' }
];

function runSingleSimulationStep() {
  const pick = SIM_ANGLERS[Math.floor(Math.random() * SIM_ANGLERS.length)];
  const roll = Math.random();
  if (roll < 0.35) {
    FishingEngine.castBait({ user: pick.user, uniqueId: pick.uniqueId, count: 5 });
  } else if (roll < 0.65) {
    FishingEngine.castRod({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.90) {
    FishingEngine.hookFish({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else {
    FishingEngine.soundHorn({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  }
}

function configureAutoSim(enabled) {
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  state.settings.autoSim = !!enabled;
  if (enabled) {
    console.log('[AutoSim] Bật chế độ giả lập cần thủ tương tác...');
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 8000);
  } else {
    console.log('[AutoSim] Đã tắt chế độ giả lập.');
  }
}

// ============================================================================
// 7. BỘ ĐIỀU PHỐI JSON-RPC 2.0 (RPC DISPATCHER)
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    // Fishing Methods
    case 'fishing.castBait':
    case 'temple.incense': // Backward-compatible alias
      return FishingEngine.castBait(params);

    case 'fishing.castRod':
    case 'temple.prayer': // Backward-compatible alias
      return FishingEngine.castRod(params);

    case 'fishing.hookFish':
    case 'temple.fortune':
    case 'temple.drawFortune': // Backward-compatible alias
      return FishingEngine.hookFish(params);

    case 'fishing.soundHorn':
    case 'temple.bell': // Backward-compatible alias
      return FishingEngine.soundHorn(params);

    case 'fishing.catchBigFish':
    case 'temple.giftLotus': // Backward-compatible alias
      return FishingEngine.catchBigFish(params);

    case 'fishing.catchLeviathan':
    case 'temple.grandCeremony': // Backward-compatible alias
      return FishingEngine.catchLeviathan(params);

    case 'fishing.getState':
    case 'temple.getState':
      return getPublicState();

    case 'fishing.getLeaderboard':
    case 'temple.getLeaderboard':
      return getLeaderboard(params.limit || 6);

    case 'fishing.resetState':
    case 'temple.resetMerit':
      return FishingEngine.resetState();

    case 'fishing.setSettings':
    case 'temple.setSettings':
      return FishingEngine.updateSettings(params);

    case 'fishing.connectTikTok':
    case 'temple.connectTikTok':
      return await connectTikTokLive(params.username);

    case 'fishing.disconnectTikTok':
    case 'temple.disconnectTikTok':
      return disconnectTikTokLive();

    case 'fishing.startAutoSim':
      configureAutoSim(true);
      return getPublicState();

    case 'fishing.stopAutoSim':
      configureAutoSim(false);
      return getPublicState();

    case 'tts.synthesize':
      return await zeroTts.synthesize(params.text, params.voice);

    case 'tts.status':
      return zeroTts.getStatus();

    default:
      throw new Error(`Method không tồn tại: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS SERVER & WEBSOCKET BROADCASTER
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tĩnh tài nguyên
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/tts-cache', express.static(TTS_CACHE_DIR));

// JSON-RPC 2.0 HTTP Endpoint
app.post('/rpc', async (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }
    });
  }

  try {
    const result = await handleRpcCall(body.method, body.params || {});
    return res.json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      result
    });
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32000, message: err.message || 'Internal RPC Error' }
    });
  }
});

// Danh mục cá API
app.get('/api/fish-catalog', (_req, res) => {
  res.json({ ok: true, catalog: FISH_CATALOG });
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WebSocket Server Error]', err?.message || err);
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch (err) {
        console.warn('[WS Broadcast Error]', err?.message || err);
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    console.warn('[WS Client Error]', err?.message || err);
  });

  // Gửi trạng thái ban đầu
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'fishing.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🎣 HỒ CÂU CÁ GIẢI TRÍ TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});
