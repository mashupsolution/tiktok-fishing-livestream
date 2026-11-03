/**
 * Fishing Lake Live Controller & WebSocket Client
 * - Tự động co giãn khung hình 9:16 (1080x1920) chuẩn xác theo màn hình
 * - Kết nối thời gian thực qua WebSocket (/ws) với JSON-RPC 2.0
 * - Điều phối hiệu ứng phao câu, cần thủ, âm thanh và giọng đọc ZeroTTS Mai Chi
 */
(function () {
  'use strict';

  // 1. Kiểm tra tham số ?obs=1 để kích hoạt chế độ OBS Studio sạch (không dock)
  const urlParams = new URLSearchParams(window.location.search);
  const isObsMode = urlParams.get('obs') === '1' || urlParams.get('obs') === 'true';
  if (isObsMode) {
    document.body.classList.add('obs-mode');
  }

  // 2. Tự động co giãn 9:16 (Auto Scale)
  const stage = document.getElementById('stage9x16');
  const stageWrapper = document.getElementById('stageWrapper');

  function resizeStage() {
    if (!stage || !stageWrapper) return;
    const availWidth = stageWrapper.clientWidth;
    const availHeight = stageWrapper.clientHeight;
    const scale = Math.min(availWidth / 1080, availHeight / 1920);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // 3. Khởi tạo Canvas Particle Engine
  const canvas = document.getElementById('fishingCanvas');
  let particleEngine = null;
  if (canvas && window.FishingParticleEngine) {
    particleEngine = new window.FishingParticleEngine(canvas);
  }

  // 4. Các phần tử DOM chính
  const bobberBody = document.getElementById('bobberBody');
  const anglerSpriteImg = document.getElementById('anglerSpriteImg');
  const anglerWishBubble = document.getElementById('anglerWishBubble');
  const anglerName = document.getElementById('anglerName');
  const anglerAction = document.getElementById('anglerAction');
  const anglerAvatar = document.getElementById('anglerAvatar');

  const statCatches = document.getElementById('statCatches');
  const statWeight = document.getElementById('statWeight');
  const statBait = document.getElementById('statBait');
  const statHorn = document.getElementById('statHorn');

  const liveStatusText = document.getElementById('liveStatusText');
  const liveDot = document.getElementById('liveDot');

  const activeAnglerName = document.getElementById('activeAnglerName');
  const activeActionTag = document.getElementById('activeActionTag');
  const leaderboardList = document.getElementById('leaderboardList');
  const vipStoolsLayer = document.getElementById('vipStoolsLayer');
  const eventFeed = document.getElementById('eventFeed');

  // Modal & Banner
  const catchModal = document.getElementById('catchModal');
  const catchBadge = document.getElementById('catchBadge');
  const catchIcon = document.getElementById('catchIcon');
  const catchFishName = document.getElementById('catchFishName');
  const catchWeight = document.getElementById('catchWeight');
  const catchAnglerName = document.getElementById('catchAnglerName');
  const catchQuote = document.getElementById('catchQuote');

  const leviathanBanner = document.getElementById('leviathanBanner');
  const leviathanTitle = document.getElementById('leviathanTitle');
  const leviathanSub = document.getElementById('leviathanSub');

  // 5. Kết nối WebSocket (/ws)
  let ws = null;
  let wsRetryTimer = null;

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Đã kết nối tới server hồ câu!');
      if (liveDot) liveDot.style.background = '#00e676';
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Mất kết nối, tự kết nối lại sau 2.5s...');
      if (liveDot) liveDot.style.background = '#ff5252';
      clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(connectWs, 2500);
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket Error]', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch (_) {}
    };
  }

  function handleWsMessage(msg) {
    if (!msg) return;

    // Trạng thái hồ câu
    if (msg.method === 'fishing.state' || msg.method === 'temple.state') {
      updatePublicState(msg.params);
    }
    // Sự kiện tương tác thời gian thực
    else if (msg.method === 'fishing.event' || msg.method === 'temple.event') {
      const eventData = msg.params?.event;
      if (eventData) {
        handleFishingEvent(eventData);
      }
      if (msg.params?.state) {
        updatePublicState(msg.params.state);
      }
    }
    // Số người xem live
    else if (msg.method === 'fishing.viewerCount' || msg.method === 'temple.viewerCount') {
      const count = msg.params?.viewerCount || 0;
      if (liveStatusText) {
        liveStatusText.textContent = `HỒ CÂU CÁ • ${count} NGƯỜI XEM`;
      }
    }
  }

  // 6. Cập nhật giao diện hồ câu từ trạng thái
  function updatePublicState(st) {
    if (!st) return;

    if (statCatches) statCatches.textContent = st.totalCatches ?? 0;
    if (statWeight) statWeight.textContent = st.totalWeightKg ?? '0.0';
    if (statBait) statBait.textContent = st.totalBait ?? 0;
    if (statHorn) statHorn.textContent = st.hornsBlown ?? 0;

    // Cập nhật bảng xếp hạng VUA SÁT CÁ
    if (leaderboardList && Array.isArray(st.leaderboard)) {
      renderLeaderboard(st.leaderboard);
      renderVipStools(st.leaderboard);
    }

    // Cập nhật trạng thái TikTok
    if (st.tiktok && liveStatusText) {
      if (st.tiktok.connected) {
        liveStatusText.textContent = `@${st.tiktok.username} • ${st.tiktok.viewerCount || 0} NGƯỜI XEM`;
        if (liveDot) liveDot.style.background = '#00e676';
      } else if (st.tiktok.connecting) {
        liveStatusText.textContent = `ĐANG KẾT NỐI @${st.tiktok.username}...`;
        if (liveDot) liveDot.style.background = '#ffea00';
      } else {
        liveStatusText.textContent = 'HỒ CÂU CÁ GIẢI TRÍ • TRỰC TIẾP';
        if (liveDot) liveDot.style.background = '#00e676';
      }
    }
  }

  function renderLeaderboard(board) {
    leaderboardList.innerHTML = '';
    board.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `${item.rank}.`;
      row.innerHTML = `
        <div class="lb-left">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name" title="${item.name}">${item.name}</span>
        </div>
        <div class="lb-weight">${item.totalWeightKg}kg</div>
      `;
      leaderboardList.appendChild(row);
    });
  }

  function renderVipStools(board) {
    if (!vipStoolsLayer) return;
    vipStoolsLayer.innerHTML = '';
    board.slice(0, 6).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'vip-stool-card';
      const avatarContent = item.avatar
        ? `<img src="${item.avatar}" class="stool-avatar" alt="" />`
        : `<div class="stool-avatar">🎣</div>`;

      card.innerHTML = `
        <div class="stool-rank-tag">TOP ${item.rank}</div>
        ${avatarContent}
        <div class="stool-name" title="${item.name}">${item.name}</div>
        <div class="stool-weight">${item.totalWeightKg}kg</div>
      `;
      vipStoolsLayer.appendChild(card);
    });
  }

  // 7. Xử lý hoạt ảnh sự kiện tương tác
  let catchModalTimer = null;
  let bannerTimer = null;

  function handleFishingEvent(ev) {
    appendEventFeed(ev);

    // Kích hoạt âm thanh & giọng đọc
    const audio = window.FishingAudio;

    switch (ev.type) {
      // 1. Thả thính / Ném mồi
      case 'castBait':
        if (audio) audio.playWaterDrop();
        if (particleEngine) particleEngine.addBaitDrop(540, 1150, ev.count || 1);
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = `Thả ${ev.count || 1} nắm thính thơm`;
        break;

      // 2. Quăng cần
      case 'castRod':
        if (audio) {
          audio.playRodWhoosh();
          audio.playWaterDrop(1.2);
        }
        if (particleEngine) particleEngine.addBaitDrop(540, 1150, 2);
        if (anglerWishBubble) anglerWishBubble.textContent = `“${ev.wish || 'Quăng cần thả phao!'}”`;
        if (anglerName) anglerName.textContent = ev.user;
        if (anglerAction) anglerAction.textContent = '✨ Quăng cần thả phao';
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = 'Vừa vung cần thả phao';

        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;

      // 3. Giật cần lên cá (Hook Fish)
      case 'hookFish':
      case 'catchBigFish':
      case 'catchLeviathan':
        const isLeviathan = ev.type === 'catchLeviathan';
        const isBig = ev.type === 'catchBigFish' || isLeviathan;

        // Rung lắc phao câu
        if (bobberBody) {
          bobberBody.classList.add('hooked');
          setTimeout(() => bobberBody.classList.remove('hooked'), 3200);
        }

        // Cần thủ giật cần
        if (anglerSpriteImg) {
          anglerSpriteImg.classList.add('reeling');
          setTimeout(() => anglerSpriteImg.classList.remove('reeling'), 3000);
        }

        // Âm thanh
        if (audio) {
          audio.playReelClick(12, 35);
          setTimeout(() => audio.playFishSplash(), 350);
          if (isBig) {
            setTimeout(() => audio.playCelebrationChime(), 800);
          }
        }

        // Hiệu ứng hạt nước
        if (particleEngine) {
          particleEngine.addFishCatch(540, 1150, isBig);
        }

        // Cập nhật thông tin cần thủ
        if (anglerWishBubble && ev.wish) {
          anglerWishBubble.textContent = `“${ev.wish}”`;
        }
        if (anglerName) anglerName.textContent = ev.user;
        if (anglerAction) {
          anglerAction.textContent = `🐟 Bắt được ${ev.fish?.name || 'Cá'} (${ev.weightKg}kg)`;
        }

        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) {
          activeActionTag.textContent = `Vừa giật được ${ev.fish?.name || 'Cá to'} ${ev.weightKg}kg`;
        }

        // Mở Modal Chiến Tích Bắt Cá đồng bộ Giọng Đọc
        if (ev.fish && catchModal) {
          catchBadge.textContent = ev.fish.rarity || 'PHỔ THÔNG';
          catchBadge.style.background = ev.fish.badgeColor || '#fbc02d';
          catchIcon.textContent = ev.fish.icon || '🐟';
          catchFishName.textContent = ev.fish.name || 'Cá Nước Ngọt';
          catchWeight.textContent = `${ev.weightKg} kg`;
          catchAnglerName.textContent = `Cần Thủ: ${ev.user}`;
          catchQuote.textContent = `“${ev.fish.quote || ''}”`;

          catchModal.classList.add('active');
          clearTimeout(catchModalTimer);
          catchModalTimer = setTimeout(() => {
            catchModal.classList.remove('active');
          }, 6500);
        }

        // Banner Thủy Quái
        if (isLeviathan && leviathanBanner) {
          leviathanTitle.textContent = `🐉 ${ev.fish?.name?.toUpperCase() || 'THỦY QUÁI XUẤT THẾ'} 🐉`;
          leviathanSub.textContent = `Đại cần thủ ${ev.user} bắt được thủy quái nặng ${ev.weightKg}kg!`;
          leviathanBanner.classList.add('active');
          clearTimeout(bannerTimer);
          bannerTimer = setTimeout(() => {
            leviathanBanner.classList.remove('active');
          }, 7000);
        }

        // Phát giọng đọc ZeroTTS
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText, {
            onStart: () => {
              if (catchModal && !catchModal.classList.contains('active')) {
                catchModal.classList.add('active');
              }
            },
            onEnd: () => {
              if (catchModal) catchModal.classList.remove('active');
            }
          });
        }
        break;

      // 4. Thổi còi báo cá
      case 'soundHorn':
        if (audio) audio.playAirHorn();
        if (particleEngine) particleEngine.addFishCatch(540, 1150, false);
        if (activeAnglerName) activeAnglerName.textContent = ev.user;
        if (activeActionTag) activeActionTag.textContent = 'Thổi còi báo cá vang rền bến hồ';
        if (ev.ttsText && audio) {
          audio.enqueueTts(ev.ttsText);
        }
        break;
    }
  }

  function appendEventFeed(ev) {
    if (!eventFeed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    item.innerHTML = `<strong>[${timeStr}] ${ev.user}</strong>: ${ev.type === 'hookFish' ? `Giật được ${ev.fish?.name} (${ev.weightKg}kg)` : ev.type === 'castBait' ? `Thả ${ev.count} mồi thính` : ev.type === 'soundHorn' ? 'Thổi còi báo cá' : 'Quăng cần thả phao'}`;
    eventFeed.prepend(item);
    if (eventFeed.children.length > 25) {
      eventFeed.removeChild(eventFeed.lastChild);
    }
  }

  // 8. Đăng ký các nút bấm tương tác trực tiếp
  async function callRpc(method, params = {}) {
    try {
      const res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      return await res.json();
    } catch (e) {
      console.warn('[RPC Error]', e.message);
      return null;
    }
  }

  function getAnglerInputs() {
    const nameInput = document.getElementById('inputAnglerName');
    const wishInput = document.getElementById('inputAnglerWish');
    return {
      user: nameInput?.value?.trim() || 'Hải Đăng Cần Thủ',
      wish: wishInput?.value?.trim() || 'Săn cá chép vàng 5 ký!'
    };
  }

  // Hotspots trên màn hình hồ câu
  const spotBait = document.getElementById('spotBait');
  const spotCast = document.getElementById('spotCast');
  const spotHorn = document.getElementById('spotHorn');
  const fishingBobberZone = document.getElementById('fishingBobberZone');

  if (spotBait) {
    spotBait.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.castBait', { user, count: 5 });
    });
  }

  if (spotCast) {
    spotCast.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.castRod', { user, wish });
    });
  }

  if (spotHorn) {
    spotHorn.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user } = getAnglerInputs();
      callRpc('fishing.soundHorn', { user });
    });
  }

  if (fishingBobberZone) {
    fishingBobberZone.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      const { user, wish } = getAnglerInputs();
      callRpc('fishing.hookFish', { user, wish });
    });
  }

  // Thẻ quà HUD đáy
  document.getElementById('cardBait')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.castBait', { user, count: 5 });
  });

  document.getElementById('cardCast')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.castRod', { user, wish });
  });

  document.getElementById('cardGourmet')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchBigFish', { user, coins: 20 });
  });

  // Nút Quick Dock
  document.getElementById('btnRpcHook')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.hookFish', { user, wish });
  });

  document.getElementById('btnRpcCast')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user, wish } = getAnglerInputs();
    callRpc('fishing.castRod', { user, wish });
  });

  document.getElementById('btnRpcBait')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.castBait', { user, count: 5 });
  });

  document.getElementById('btnRpcHorn')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.soundHorn', { user });
  });

  document.getElementById('btnRpcBigFish')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchBigFish', { user, coins: 35 });
  });

  document.getElementById('btnRpcLeviathan')?.addEventListener('click', () => {
    window.FishingAudio?.ensureContext();
    const { user } = getAnglerInputs();
    callRpc('fishing.catchLeviathan', { user, coins: 199 });
  });

  // Điều khiển âm thanh
  const btnUnlockAudio = document.getElementById('btnUnlockAudio');
  if (btnUnlockAudio) {
    btnUnlockAudio.addEventListener('click', () => {
      window.FishingAudio?.ensureContext();
      btnUnlockAudio.textContent = '✅ Đã Bật Âm Thanh & Giọng Đọc';
      btnUnlockAudio.classList.remove('gold');
    });
  }

  const btnToggleMusic = document.getElementById('btnToggleMusic');
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ensureContext();
      audio.bgMusicEnabled = !audio.bgMusicEnabled;
      if (audio.bgMusicEnabled) {
        audio.startLakeAmbience();
        btnToggleMusic.textContent = '🎵 Âm Hồ Nước: BẬT';
        btnToggleMusic.classList.add('active-toggle');
      } else {
        audio.stopLakeAmbience();
        btnToggleMusic.textContent = '🎵 Âm Hồ Nước: TẮT';
        btnToggleMusic.classList.remove('active-toggle');
      }
    });
  }

  const btnToggleTts = document.getElementById('btnToggleTts');
  if (btnToggleTts) {
    btnToggleTts.addEventListener('click', () => {
      const audio = window.FishingAudio;
      if (!audio) return;
      audio.ttsEnabled = !audio.ttsEnabled;
      btnToggleTts.textContent = audio.ttsEnabled ? '🎙️ Giọng Đọc: BẬT' : '🎙️ Giọng Đọc: TẮT';
      btnToggleTts.classList.toggle('active-toggle', audio.ttsEnabled);
    });
  }

  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol) {
    sliderMusicVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valMusicVol) valMusicVol.textContent = `${val}%`;
      window.FishingAudio?.setMusicVolume(val / 100);
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol) {
    sliderTtsVol.addEventListener('input', (e) => {
      const val = e.target.value;
      if (valTtsVol) valTtsVol.textContent = `${val}%`;
      window.FishingAudio?.setTtsVolume(val / 100);
    });
  }

  // Kết nối TikTok Live
  const btnConnectTikTok = document.getElementById('btnConnectTikTok');
  const inputTikTokUser = document.getElementById('inputTikTokUser');
  if (btnConnectTikTok) {
    btnConnectTikTok.addEventListener('click', async () => {
      const username = inputTikTokUser?.value?.trim();
      if (!username) return alert('Vui lòng nhập @username hoặc link TikTok Live');
      btnConnectTikTok.textContent = 'Đang kết nối...';
      btnConnectTikTok.disabled = true;
      try {
        await callRpc('fishing.connectTikTok', { username });
      } finally {
        btnConnectTikTok.textContent = 'Kết Nối';
        btnConnectTikTok.disabled = false;
      }
    });
  }

  // Tự động giả lập cần thủ
  let autoSimState = false;
  const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');
  if (btnToggleAutoSim) {
    btnToggleAutoSim.addEventListener('click', async () => {
      autoSimState = !autoSimState;
      if (autoSimState) {
        await callRpc('fishing.startAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: BẬT';
        btnToggleAutoSim.classList.add('gold');
      } else {
        await callRpc('fishing.stopAutoSim');
        btnToggleAutoSim.textContent = '🤖 Tự động Giả lập: TẮT';
        btnToggleAutoSim.classList.remove('gold');
      }
    });
  }

  // Bấm đóng modal chiến tích khi click ra ngoài
  if (catchModal) {
    catchModal.addEventListener('click', (e) => {
      if (e.target === catchModal) {
        catchModal.classList.remove('active');
      }
    });
  }

  // Khởi động kết nối
  connectWs();
})();
