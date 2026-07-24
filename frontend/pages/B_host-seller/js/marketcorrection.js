// js/marketcorrection.js
// 마켓 수정 페이지 전용 스크립트
// 흐름: URL에서 marketId 읽기 -> 기존 마켓 정보 조회(GET) -> 폼에 채우기 -> 제출 시 PATCH

// ============================================
// 0. URL에서 marketId 가져오기
// ============================================
function getMarketIdFromUrl() {
  return new URLSearchParams(window.location.search).get('marketId');
}

// ============================================
// 1. 마켓 수정 API 호출 (이미 있던 코드 그대로)
// ============================================
async function correctionMarket(marketId, payload) {
  return callApi(`/markets/${marketId}`, { method: 'PATCH', body: payload });
}

// ============================================
// 2. 기존 마켓 정보를 불러와서 폼에 채워 넣기
//    백엔드에 GET /markets/:marketId (상세 조회)가 이미 있다는 전제로 작성
// ============================================
async function loadMarketForEdit(marketId) {
  try {
    const res = await callApi(`/markets/${marketId}`); // GET, 상세 조회
    if (!res || !res.success || !res.data) {
      renderAlert('마켓 정보를 불러오지 못했습니다.');
      return;
    }

    const market = res.data;

    // 텍스트/숫자 필드 채우기
    document.getElementById('title').value = market.title || '';
    document.getElementById('booth-price').value = market.boothPrice ?? 0;
    document.getElementById('max-participants').value = market.maxParticipants ?? 0;
    document.getElementById('description').value = market.description || '';

    // 날짜 필드 채우기 (DB에서 오는 값이 'YYYY-MM-DDTHH:mm:ss.000Z' 형태일 수 있어 앞 10자리만 사용)
    document.getElementById('start-event-date').value = market.eventDate_min ? market.eventDate_min.slice(0, 10) : '';
    document.getElementById('end-event-date').value = market.eventDate_max ? market.eventDate_max.slice(0, 10) : '';
    document.getElementById('recruitmentDate_min').value = market.recruitmentDate_min ? market.recruitmentDate_min.slice(0, 10) : '';
    document.getElementById('recruitmentDate_max').value = market.recruitmentDate_max ? market.recruitmentDate_max.slice(0, 10) : '';

    // 주소 관련 hidden/표시 필드 채우기
    document.getElementById('address').value = market.locationName || '';
    document.getElementById('fullAddress').value = market.locationName || '';
    document.getElementById('region').value = market.region || '';
    document.getElementById('latitude').value = market.latitude || '';
    document.getElementById('longitude').value = market.longitude || '';

    // 기존 이미지 경로를 hidden input에 미리 채워둠 (새 이미지 업로드 안 하면 이 값 그대로 전송됨)
    document.getElementById('uploadedImagePath').value = market.marketImage || '';
    console.log(market.marketImage);
    // 기존 이미지 미리보기 (있을 때만)
    if (market.marketImage) {
      const statusEl = document.getElementById('image-upload-status');
      statusEl.innerHTML = `
        <p class="form-hint">현재 등록된 이미지</p>
        <img src="http://localhost:5000/api${market.marketImage}" alt="현재 마켓 이미지"
             style="max-width:100%; max-height:180px; border-radius:8px; margin-top:6px;" />
      `;
    }

  } catch (err) {
    console.error('마켓 정보 조회 오류:', err);
    renderAlert('서버에 연결할 수 없습니다.');
  }
}

// ============================================
// 3. 폼 제출 이벤트 (수정 전용으로 correctionMarket 호출)
// ============================================
function correctionMarketClick(marketId) {
  if (!marketId) return;

  const form = document.getElementById('market-create-form');
  if (!form) return;
  const submitBtn = document.getElementById('market-create-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    // ---- 1) 원본 입력값 읽기 ----
    const titleVal = document.getElementById('title').value.trim();
    const startEventDateVal = document.getElementById('start-event-date').value;
    const endEventDateVal = document.getElementById('end-event-date').value;
    const startRecruitmentDateVal = document.getElementById('recruitmentDate_min').value;
    const endRecruitmentDateVal = document.getElementById('recruitmentDate_max').value;
    const boothPriceRaw = document.getElementById('booth-price').value;
    const maxParticipantsRaw = document.getElementById('max-participants').value;
    const fullAddressVal = document.getElementById('fullAddress').value.trim();

    // ---- 2) 검증 ----
    if (!titleVal) {
      renderAlert('마켓 이름을 입력해주세요.');
      return;
    }
    if (!startEventDateVal || !endEventDateVal) {
      renderAlert('개최 일자를 모두 입력해주세요.');
      return;
    }
    if (new Date(endEventDateVal) < new Date(startEventDateVal)) {
      renderAlert('종료일은 시작일보다 빠를 수 없어요.');
      return;
    }
    if (!fullAddressVal) {
      renderAlert('개최 장소 주소를 검색해서 선택해주세요.');
      return;
    }
    const boothPriceNum = Number(boothPriceRaw);
    if (boothPriceRaw === '' || Number.isNaN(boothPriceNum) || boothPriceNum < 0) {
      renderAlert('부스료는 0 이상의 숫자로 입력해주세요.');
      return;
    }
    const maxParticipantsNum = Number(maxParticipantsRaw);
    if (maxParticipantsRaw === '' || !Number.isInteger(maxParticipantsNum) || maxParticipantsNum < 0) {
      renderAlert('허용 가능한 최대 부스 수는 0 이상의 정수로 입력해주세요.');
      return;
    }

    // ---- 3) 새 이미지를 선택했을 때만 업로드 (안 바꿨으면 기존 uploadedImagePath 값 그대로 사용) ----
    const fileInput = document.getElementById('market-image');
    if (fileInput.files && fileInput.files[0]) {
      await uploadMarketImage();
    }

    const payload = {
      title: titleVal,
      eventDate_min: startEventDateVal,
      eventDate_max: endEventDateVal,
      recruitmentDate_min: startRecruitmentDateVal,
      recruitmentDate_max: endRecruitmentDateVal,
      boothPrice: boothPriceNum,
      description: document.getElementById('description').value.trim(),
      locationName: fullAddressVal,
      region: document.getElementById('region').value || null,
      latitude: document.getElementById('latitude').value || null,
      longitude: document.getElementById('longitude').value || null,
      maxParticipants: maxParticipantsNum,
      marketImage: document.getElementById('uploadedImagePath').value || null,
    };

    console.log('마켓 수정 payload:', payload);

    setButtonLoading(submitBtn, true, '수정 중...', '수정하기');
    try {
      const res = await correctionMarket(marketId, payload);
      if (res && res.success) {
        renderAlert('마켓 정보가 수정됐어요!', 'success');
        setTimeout(() => {
          window.location.href = 'mymarketpage.html';
        }, 1000);
      } else {
        renderAlert(res?.message || '수정에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
    }
  });
}

// ============================================
// 4. 이미지 업로드 (기존 로직 그대로 유지)
// ============================================
async function uploadMarketImage() {
  const fileInput = document.getElementById('market-image');
  const file = fileInput.files[0];

  if (!file) return;

  const formData = new FormData();
  formData.append('marketImage', file);

  try {
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      document.getElementById('uploadedImagePath').value = data.filePath;
    } else {
      console.error('이미지 업로드 실패:', data.message);
    }
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
  }
}

function setButtonLoading(btn, isLoading, loadingText, defaultText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? loadingText : defaultText;
}
function renderAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

// ============================================
// 초기 실행: marketId 확인 -> 기존 정보 로드 -> 제출 이벤트 연결
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const marketId = getMarketIdFromUrl();

  if (!marketId) {
    renderAlert('수정할 마켓 정보를 찾을 수 없습니다. (marketId 없음)');
    return;
  }
  await loadMarketForEdit(marketId);   // 기존 값 채우기
  correctionMarketClick(marketId); 
});
