// ============================================
// 공통: 오늘 기준 최소 선택 가능 날짜 (내일)
// ============================================
function getMinDate(baseDate = new Date(), addDays = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + addDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const minDate = getMinDate(); // 오늘 기준 내일

// ============================================
// 요소 가져오기
// ============================================
const startEventDateInput = document.getElementById('start-event-date');
const endEventDateInput = document.getElementById('end-event-date');
const startRecruitmentDateInput = document.getElementById('recruitmentDate_min');
const endRecruitmentDateInput = document.getElementById('recruitmentDate_max');

// ============================================
// 초기 min 값 설정
// ============================================
startEventDateInput.setAttribute('min', minDate);
endEventDateInput.setAttribute('min', minDate);
startRecruitmentDateInput.setAttribute('min', minDate);
endRecruitmentDateInput.setAttribute('min', minDate);

// ============================================
// 개최 일자: 시작일 선택 시, 종료일의 min을 그 날짜로
// ============================================
startEventDateInput.addEventListener('change', () => {
  const selectedStart = startEventDateInput.value;

  if (selectedStart) {
    endEventDateInput.setAttribute('min', selectedStart);
    if (endEventDateInput.value && endEventDateInput.value < selectedStart) {
      endEventDateInput.value = selectedStart;
    }
  }
});

// ============================================
// 모집 일자: 시작일 선택 시, 모집 종료일의 min을 그 날짜로
// ============================================
startRecruitmentDateInput.addEventListener('change', () => {
  const selectedStart = startRecruitmentDateInput.value;

  if (selectedStart) {
    endRecruitmentDateInput.setAttribute('min', selectedStart);
    if (endRecruitmentDateInput.value && endRecruitmentDateInput.value < selectedStart) {
      endRecruitmentDateInput.value = selectedStart;
    }
  }
});

// ============================================
// 📌 핵심 추가: 모집 마감일이 정해지면, 개최 시작일은 그로부터 최소 7일 뒤부터 선택 가능
// ============================================
endRecruitmentDateInput.addEventListener('change', () => {
  const recruitmentMax = endRecruitmentDateInput.value;
  if (!recruitmentMax) return;

  // 모집 마감일 + 7일을 개최 시작일의 최소값으로 설정
  const earliestEventDate = getMinDate(new Date(recruitmentMax), 7);
  startEventDateInput.setAttribute('min', earliestEventDate);

  // 이미 선택되어 있던 개최 시작일이 새 최소값보다 이르면 자동 보정
  if (startEventDateInput.value && startEventDateInput.value < earliestEventDate) {
    startEventDateInput.value = earliestEventDate;
    // 개최 종료일도 같이 맞춰줘야 하니, change 이벤트를 강제로 한 번 실행
    startEventDateInput.dispatchEvent(new Event('change'));
  }
});