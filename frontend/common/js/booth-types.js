// frontend/common/js/booth-types.js
// [부스 종류] 화면 공통 모듈
//
// 담는 것
//   1) 주최자 편집 UI — 마켓 등록/수정 화면의 「부스 추가」 영역 (A → B → C, 최대 3개)
//   2) 판매자/방문자 표시 — 메인 카드·상세·신청 화면에서 종류별 가격을 그리는 함수
//
// 왜 공통 파일인가
//   등록(market.js)과 수정(marketcorrection.js)이 각자 같은 UI를 만들면 반드시 어긋납니다.
//   실제로 「초과 신청 허용」이 수정 화면에만 있었던 게 그런 사고였습니다.
//   두 화면이 이 파일 하나를 같이 쓰게 해서 한쪽만 바뀌는 일을 막습니다.
//
// 이름 규칙
//   주최자가 이름을 직접 입력하지 않습니다. 순서대로 A, B, C 로 자동으로 붙습니다.
//   서버(utills/boothTypes.js)도 같은 규칙으로 다시 매기므로, 화면과 DB 표기가 항상 같습니다.

(function () {
  const LABELS = ['A', 'B', 'C'];
  const MAX = LABELS.length;

  /* ============================================================
     1. 주최자 편집 UI
     ============================================================ */

  const editor = {
    rootEl: null,
    addBtnEl: null,
    countEl: null,
    priceInputEl: null,   // 기존 「부스료」 입력칸 (종류를 쓰면 A 가격과 동기화)
    priceHintEl: null,
    rows: [],             // { boothTypeId:number|null, price:string }
  };

  function labelOf(index) {
    return LABELS[index] ?? String(index + 1);
  }

  function rowHtml(row, index, total) {
    const applied = Number(row.applicationCount) || 0;
    const locked = applied > 0;
    const stopped = row.isActive === false;

    // 삭제 조건 두 가지를 모두 만족해야 버튼이 나옵니다.
    //   1) 마지막 칸일 것
    //      — 중간(B)을 지우면 C가 B로 밀려 이름이 바뀌고, B에 신청한 판매자의 종류가 소리 없이 달라집니다.
    //   2) 그 칸에 신청이 하나도 없을 것
    //      — 신청자가 있는 부스를 지우면 환불부터 정리해야 합니다. 그 상황을 아예 안 만듭니다.
    //        대신 「신규 신청 중단」으로 더 이상 받지 않게 할 수 있습니다.
    const canRemove = total > 1 && index === total - 1 && !locked;

    let tail;
    if (canRemove) {
      tail = `<button type="button" class="btn btn-outline btn-sm booth-type-remove">삭제</button>`;
    } else if (locked) {
      tail = `<span class="booth-type-locked" title="신청이 있어 삭제할 수 없어요">신청 ${applied}건</span>`;
    } else {
      tail = `<span class="booth-type-remove-placeholder" aria-hidden="true"></span>`;
    }

    const stopToggle = locked
      ? `<label class="booth-type-stop">
           <input type="checkbox" class="booth-type-stop-input"${stopped ? ' checked' : ''} />
           신규 신청 중단
         </label>`
      : '';

    const notice = locked
      ? `<p class="booth-type-note">이 부스는 신청 ${applied}건이 있어 삭제할 수 없어요.
         더 받지 않으시려면 「신규 신청 중단」을 켜주세요. 기존 신청자는 그대로 유지됩니다.</p>`
      : '';

    return `
      <div class="booth-type-row-wrap${locked ? ' is-locked-row' : ''}${stopped ? ' is-stopped' : ''}" data-index="${index}">
        <div class="booth-type-row" data-index="${index}">
          <span class="booth-type-label">부스 ${labelOf(index)}${stopped ? ' <em>(중단)</em>' : ''}</span>
          <div class="booth-type-price-wrap">
            <input type="number" class="form-input booth-type-price" min="0" step="100"
                   placeholder="0" value="${row.price ?? ''}"
                   aria-label="부스 ${labelOf(index)} 가격" />
            <span class="booth-type-unit">원</span>
          </div>
          <div class="booth-type-cap-wrap">
            <input type="number" class="form-input booth-type-capacity" min="0" step="1"
                   placeholder="0" value="${row.capacity ?? ''}"
                   aria-label="부스 ${labelOf(index)} 수량" />
            <span class="booth-type-unit">칸</span>
          </div>
          ${tail}
        </div>
        ${stopToggle}
        ${notice}
      </div>`;
  }

  /**
   * [종류별 수량] 합계와 총 정원을 비교해 그 자리에서 알려줍니다.
   *   저장 버튼을 눌러야만 알 수 있으면, 주최자는 11칸을 다 입력하고 나서야
   *   총 정원이 10이라는 걸 알게 됩니다. 입력하는 동안 바로 보이게 합니다.
   */
  function syncCapacitySummary() {
    if (!editor.rootEl) return;

    const box = document.getElementById('booth-type-capacity-summary');
    if (!box) return;

    const totalEl = document.getElementById('max-participants');
    const total = Number(totalEl?.value);
    const rows = editor.rows.filter((r) => String(r.price ?? '').trim() !== '');
    const sum = rows.reduce((acc, r) => acc + (Number(r.capacity) || 0), 0);

    // 수량을 하나도 안 정했으면 비교할 게 없습니다.
    if (sum <= 0) {
      box.className = 'booth-cap-summary';
      box.textContent = '종류별 수량을 비워두면 개수 제한 없이 받아요. (총 부스 수 규칙은 그대로 적용돼요)';
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      box.className = 'booth-cap-summary';
      box.textContent = `종류별 수량 합계 ${sum}칸 · 총 부스 수는 제한 없음`;
      return;
    }

    if (sum > total) {
      box.className = 'booth-cap-summary over';
      box.textContent = `종류별 수량 합계 ${sum}칸이 총 부스 수 ${total}칸보다 ${sum - total}칸 많아요. `
        + '이대로는 저장할 수 없어요. 총 부스 수를 늘리거나 종류별 수량을 줄여주세요.';
      return;
    }

    const left = total - sum;
    box.className = 'booth-cap-summary ok';
    box.textContent = `종류별 수량 합계 ${sum}칸 / 총 부스 수 ${total}칸`
      + (left > 0 ? ` · ${left}칸은 종류를 안 정한 신청에 쓸 수 있어요.` : ' · 딱 맞아요.');
  }

  function syncBasePrice() {
    // 종류를 쓰는 마켓은 기존 「부스료」 칸을 A 가격으로 맞추고 잠급니다.
    //   markets.boothPrice 는 목록 정렬·검색·기존 화면이 계속 쓰는 값이라 비워둘 수 없고,
    //   주최자가 두 곳에 다른 값을 넣으면 어느 쪽이 진짜인지 알 수 없게 됩니다.
    if (!editor.priceInputEl) return;

    const usable = editor.rows.filter((r) => String(r.price ?? '').trim() !== '');

    if (usable.length > 0) {
      editor.priceInputEl.value = Number(usable[0].price) || 0;
      editor.priceInputEl.readOnly = true;
      editor.priceInputEl.classList.add('is-locked');
      if (editor.priceHintEl) {
        editor.priceHintEl.textContent =
          '부스 종류를 쓰는 마켓이라 기본 부스료는 부스 A의 가격으로 자동 설정됩니다.';
      }
    } else {
      editor.priceInputEl.readOnly = false;
      editor.priceInputEl.classList.remove('is-locked');
      if (editor.priceHintEl) {
        editor.priceHintEl.textContent = '참가비가 없다면 0을 입력해주세요.';
      }
    }
  }

  function readRowsFromDom() {
    if (!editor.rootEl) return;
    editor.rootEl.querySelectorAll('.booth-type-row-wrap').forEach((el) => {
      const i = Number(el.dataset.index);
      if (!editor.rows[i]) return;
      const input = el.querySelector('.booth-type-price');
      editor.rows[i].price = input ? input.value : '';
      const cap = el.querySelector('.booth-type-capacity');
      editor.rows[i].capacity = cap ? cap.value : '';
      const stop = el.querySelector('.booth-type-stop-input');
      if (stop) editor.rows[i].isActive = !stop.checked;
    });
  }

  function render() {
    if (!editor.rootEl) return;
    editor.rootEl.innerHTML = editor.rows
      .map((row, i) => rowHtml(row, i, editor.rows.length))
      .join('');

    if (editor.addBtnEl) {
      const full = editor.rows.length >= MAX;
      editor.addBtnEl.disabled = full;
      editor.addBtnEl.textContent = full
        ? `부스 종류는 ${MAX}개(A/B/C)까지예요`
        : `＋ 부스 추가 (${labelOf(editor.rows.length)})`;
    }
    if (editor.countEl) {
      editor.countEl.textContent = `${editor.rows.length} / ${MAX}`;
    }
    syncBasePrice();
    syncCapacitySummary();
  }

  function addRow() {
    if (editor.rows.length >= MAX) return;
    readRowsFromDom();
    editor.rows.push({ boothTypeId: null, price: '', capacity: '', isActive: true, applicationCount: 0 });
    render();
    // 방금 추가한 칸에 커서를 둡니다.
    const inputs = editor.rootEl?.querySelectorAll('.booth-type-price');
    inputs?.[inputs.length - 1]?.focus();
  }

  function removeLastRow() {
    if (editor.rows.length <= 1) return;
    readRowsFromDom();
    editor.rows.pop();
    render();
  }

  /**
   * 편집 UI를 붙입니다.
   * @param {object} opts
   *   rootId       행이 그려질 컨테이너 id
   *   addBtnId     「부스 추가」 버튼 id
   *   countId      (선택) "1 / 3" 표시 영역 id
   *   priceInputId (선택) 기존 부스료 입력칸 id — A 가격과 동기화
   *   priceHintId  (선택) 부스료 안내문 id
   */
  function mount(opts = {}) {
    editor.rootEl = document.getElementById(opts.rootId);
    if (!editor.rootEl) return false;

    editor.addBtnEl = opts.addBtnId ? document.getElementById(opts.addBtnId) : null;
    editor.countEl = opts.countId ? document.getElementById(opts.countId) : null;
    editor.priceInputEl = opts.priceInputId ? document.getElementById(opts.priceInputId) : null;
    editor.priceHintEl = opts.priceHintId ? document.getElementById(opts.priceHintId) : null;

    // 처음에는 부스 A 한 줄로 시작합니다.
    if (editor.rows.length === 0) editor.rows = [{ boothTypeId: null, price: '', capacity: '', isActive: true, applicationCount: 0 }];

    editor.addBtnEl?.addEventListener('click', (e) => { e.preventDefault(); addRow(); });

    // 행은 다시 그려지므로 개별 버튼이 아니라 컨테이너에서 위임 처리합니다.
    editor.rootEl.addEventListener('click', (e) => {
      if (e.target.closest('.booth-type-remove')) {
        e.preventDefault();
        removeLastRow();
      }
    });
    editor.rootEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('booth-type-price')) {
        readRowsFromDom();
        syncBasePrice();
        syncCapacitySummary();
      }
      if (e.target.classList.contains('booth-type-capacity')) {
        readRowsFromDom();
        syncCapacitySummary();
      }
    });
    // 총 부스 수를 고치면 합계 비교도 같이 갱신돼야 합니다.
    const totalEl = document.getElementById('max-participants');
    totalEl?.addEventListener('input', syncCapacitySummary);

    editor.rootEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('booth-type-stop-input')) {
        readRowsFromDom();
        render();
      }
    });

    render();
    return true;
  }

  /** 서버에서 불러온 기존 종류를 화면에 채웁니다. (수정 화면) */
  function setTypes(list) {
    if (!editor.rootEl) return;
    const arr = Array.isArray(list) ? list.slice(0, MAX) : [];
    editor.rows = arr.length > 0
      ? arr.map((t) => ({
          boothTypeId: t.boothTypeId ?? null,
          price: String(t.price ?? ''),
          // 0 은 "제한 없음"이라 빈칸으로 보여줍니다. 0을 그대로 띄우면
          // 주최자가 "0칸만 받는다"로 오해할 수 있습니다.
          capacity: Number(t.capacity) > 0 ? String(t.capacity) : '',
          isActive: t.isActive !== false,
          applicationCount: Number(t.applicationCount) || 0,
        }))
      : [{ boothTypeId: null, price: '', capacity: '', isActive: true, applicationCount: 0 }];
    render();
  }

  /**
   * 서버로 보낼 배열을 만듭니다.
   * 가격을 안 채운 칸은 빼고 보냅니다. (전부 비면 빈 배열 = 종류를 안 쓰는 마켓)
   */
  function getTypes() {
    if (!editor.rootEl) return null;
    readRowsFromDom();
    return editor.rows
      .filter((r) => String(r.price ?? '').trim() !== '')
      .map((r) => ({
        boothTypeId: r.boothTypeId,
        price: Number(r.price),
        // 빈칸 = 제한 없음(0)
        capacity: String(r.capacity ?? '').trim() === '' ? 0 : Number(r.capacity),
        isActive: r.isActive !== false,
      }));
  }

  /** 제출 전 검사. 문제가 있으면 메시지를 돌려줍니다. */
  function validate() {
    const list = getTypes();
    if (list === null) return null;
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i].price;
      if (!Number.isInteger(p) || p < 0) {
        return `부스 ${labelOf(i)}의 가격은 0 이상의 정수로 입력해주세요.`;
      }
      const c = list[i].capacity;
      if (!Number.isInteger(c) || c < 0) {
        return `부스 ${labelOf(i)}의 수량은 0 이상의 정수로 입력해주세요. (비워두면 제한 없음)`;
      }
    }

    // 종류별 수량 합계가 총 정원을 넘으면 앞뒤가 안 맞습니다.
    //   총 정원이 먼저 차서 남은 종류는 신청을 못 받게 되므로 미리 알려줍니다.
    const totalEl = document.getElementById('max-participants');
    const total = Number(totalEl?.value);
    const sum = list.reduce((acc, t) => acc + (t.capacity || 0), 0);
    if (Number.isFinite(total) && total > 0 && sum > 0 && sum > total) {
      return `부스 종류별 수량 합계(${sum}칸)가 「허용 가능한 최대 부스 수」(${total}칸)보다 많아요. `
        + '총 부스 수를 늘리거나 종류별 수량을 줄여주세요.';
    }
    return null;
  }

  /* ============================================================
     2. 표시용 렌더러 (메인 카드 / 상세 / 신청 화면)
     ============================================================ */

  function won(n) {
    const v = Number(n) || 0;
    return v === 0 ? '무료' : `${v.toLocaleString()}원`;
  }

  /**
   * 종류 목록을 칩 형태로 그립니다. 종류가 없으면 빈 문자열.
   * @param types  [{ boothTypeId, name, price }]
   * @param opts.changes  { [boothTypeId]: { original, direction, pct } } — 금액 변동 표시용(선택)
   */
  /**
   * 종류별 신청 현황 게이지.
   *   분모는 그 종류의 수량(capacity), 분자는 실제 신청 수(applicationCount).
   *   수량을 안 정한 종류(capacity=0)는 막대 대신 신청 수만 보여줍니다.
   *   비율을 보여줄 수 없는데 억지로 막대를 그리면 다 찬 것처럼 오해하게 됩니다.
   */
  function renderGauge(t) {
    const applied = Number(t.applicationCount) || 0;
    const cap = Number(t.capacity) || 0;

    if (cap <= 0) {
      return applied > 0
        ? `<div class="booth-type-gauge no-cap"><span class="bt-gauge-text">신청 ${applied}칸</span></div>`
        : '<div class="booth-type-gauge no-cap"><span class="bt-gauge-text muted">신청 없음</span></div>';
    }

    const pct = Math.round((applied / cap) * 100);
    // 막대 길이는 100%에서 멈춥니다. 초과분은 숫자로 알려줍니다.
    const width = Math.min(pct, 100);
    const level = applied >= cap ? 'full' : (pct >= 70 ? 'high' : 'normal');

    return `
      <div class="booth-type-gauge">
        <div class="bt-gauge-bar">
          <span class="bt-gauge-fill ${level}" style="width:${width}%"></span>
        </div>
        <span class="bt-gauge-text ${level}">
          ${applied} / ${cap}칸${applied >= cap ? ' · 마감' : ''}
        </span>
      </div>`;
  }

  function renderList(types, opts = {}) {
    // 「신규 신청 중단」된 종류는 신청할 수 없으므로 목록에서 뺍니다.
    const shown = (Array.isArray(types) ? types : []).filter((t) => t.isActive !== false);
    if (shown.length === 0) return '';
    const changes = opts.changes || {};

    const items = shown.slice(0, MAX).map((t) => {
      const c = changes[t.boothTypeId];
      const changed = c && c.direction && c.direction !== 'same';
      const arrow = c && c.direction === 'down' ? '↓' : '↑';
      const dirClass = c && c.direction === 'down' ? 'down' : 'up';

      const priceHtml = changed
        ? `<s class="bt-old">${won(c.original)}</s>
           <span class="bt-arrow">→</span>
           <strong class="bt-new">${won(t.price)}</strong>
           <span class="bt-rate ${dirClass}">${arrow} ${c.pct === null ? '무료 → 유료' : c.pct + '%'}</span>`
        : `<strong class="bt-new">${won(t.price)}</strong>`;

      return `
        <li class="booth-type-item${changed ? ' changed ' + dirClass : ''}">
          <div class="booth-type-item-main">
            <span class="booth-type-chip">${t.name}</span>
            <span class="booth-type-price-text">${priceHtml}</span>
          </div>
          ${renderGauge(t)}
        </li>`;
    }).join('');

    return `
      <div class="booth-type-list-block">
        <div class="booth-type-list-title">부스 종류 ${shown.length}가지</div>
        <ul class="booth-type-list">${items}</ul>
      </div>`;
  }

  /** select 옵션 문자열 — 판매자 신청 화면용 */
  function renderOptions(types, selectedId) {
    // 중단된 종류는 고를 수 없습니다. (서버도 같은 기준으로 다시 막습니다)
    const shown = (Array.isArray(types) ? types : []).filter((t) => t.isActive !== false);
    if (shown.length === 0) return '';
    return shown.slice(0, MAX).map((t) => {
      const sel = Number(selectedId) === Number(t.boothTypeId) ? ' selected' : '';
      const cap = Number(t.capacity) || 0;
      const applied = Number(t.applicationCount) || 0;
      const full = cap > 0 && applied >= cap;
      // 마감된 종류는 고를 수 없게 막습니다. 서버도 BOOTH_TYPE_FULL 로 다시 막습니다.
      const left = cap > 0 ? ` · ${full ? '마감' : `${cap - applied}칸 남음`}` : '';
      return `<option value="${t.boothTypeId}" data-price="${t.price}"${sel}${full ? ' disabled' : ''}>`
        + `부스 ${t.name} — ${won(t.price)}${left}</option>`;
    }).join('');
  }

  window.BoothTypes = {
    LABELS, MAX, labelOf,
    mount, setTypes, getTypes, validate,
    renderList, renderOptions, won,
  };
})();
