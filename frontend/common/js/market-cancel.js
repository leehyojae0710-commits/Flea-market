// frontend/common/js/market-cancel.js
// [마켓 취소 공통 모듈]
//
// 왜 공용으로 뺐나
//   마켓 취소는 두 화면에서 누를 수 있습니다.
//     ① 내 마켓 관리 (mymarketpage.html → marketdelete.js)
//     ② 마켓 상세    (market-detail.html → market.js)
//   그런데 취소는 결제한 판매자에게 전액 환불이 나가는 동작이라,
//   "환불 예상 금액을 보여주고 확인받는" 절차가 반드시 앞에 붙어야 합니다.
//   이 절차를 두 화면에 각각 복사하면 한쪽만 고쳐져서 금액 계산이나
//   확인 문구가 갈라집니다. (실제로 환불 로직이 두 곳에 복사돼 동작이 달랐던 적이 있습니다)
//   그래서 한 파일에 두고 두 화면이 같이 부릅니다.
//
// 쓰는 법
//   const result = await MarketCancel.run(marketId);
//   if (result.cancelled) { ... 목록 새로고침 ... }
//
// 필요한 것
//   common/js/api.js 의 callApi 가 먼저 로드돼 있어야 합니다.
//   모달 스타일은 common/css/style.css 의 .cancel-modal-* 를 씁니다.

(function () {
  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */

  // 취소 전에 "얼마가 환불되는지" 미리 계산해 옵니다. DB 는 바뀌지 않습니다.
  async function fetchPreview(marketId) {
    return callApi(`/markets/${marketId}/cancel-preview`);
  }

  // 결제 건이 있으면 confirmRefund 없이는 서버가 409 로 거부합니다.
  async function requestCancel(marketId, confirmRefund = false) {
    return callApi(`/markets/closed/${marketId}`, {
      method: 'PATCH',
      body: { confirmRefund },
    });
  }

  /* ------------------------------------------------------------------ */
  /* 확인 모달                                                            */
  /* ------------------------------------------------------------------ */

  function escapeHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * 같은 페이지 안에 확인 창을 띄웁니다. (별도 HTML 파일을 만들지 않습니다)
   * @param preview        서버가 준 환불 예상 내역. 못 받았으면 null
   * @param previewFailed  미리보기 조회가 실패했는지
   * @returns Promise<boolean> 예 = true
   */
  function showConfirm(preview, previewFailed = false) {
    return new Promise((resolve) => {
      const hasSellers = preview && preview.sellerCount > 0;
      const refundTotal = Number(preview?.refundTotal || 0);

      const rows = hasSellers
        ? (preview.byBoothType || []).map((g) => `
            <tr>
              <td>${escapeHtml(g.boothTypeName)}</td>
              <td class="num">${g.paidCount}건</td>
              <td class="num strong">${Number(g.refundTotal).toLocaleString()}원</td>
              <td class="num muted">${g.unpaidCount}건</td>
            </tr>`).join('')
        : '';

      let body;
      if (hasSellers) {
        body = `
          <p class="cancel-lead">
            이 마켓에 신청한 판매자가 <strong>${preview.sellerCount}명</strong> 있어요.
            취소하면 결제한 금액을 <strong>전액 환불</strong>하고 전원에게 알림이 갑니다.
          </p>
          <table class="cancel-table">
            <thead>
              <tr><th>부스</th><th class="num">결제</th><th class="num">환불 금액</th><th class="num">결제 전</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td>합계</td>
                <td class="num">${preview.refundCount}건</td>
                <td class="num total">${refundTotal.toLocaleString()}원</td>
                <td class="num muted">${preview.unpaidCount}건</td>
              </tr>
            </tfoot>
          </table>
          ${refundTotal > 0
            ? `<p class="cancel-warn">환불 예상 총액 <strong>${refundTotal.toLocaleString()}원</strong>이 결제 취소로 빠져나갑니다. 되돌릴 수 없어요.</p>`
            : `<p class="cancel-note">결제된 건이 없어 환불할 금액은 없어요. 신청 ${preview.unpaidCount}건은 함께 취소됩니다.</p>`}`;
      } else if (previewFailed) {
        // 못 불러온 것과 없는 것은 다릅니다.
        // "신청자가 없어요" 라고 단정하면 결제한 사람이 있는데도 없는 줄 알고 누르게 됩니다.
        body = `
          <p class="cancel-lead">환불 예상 금액을 불러오지 못했어요.</p>
          <p class="cancel-warn">
            신청자와 결제 내역을 확인하지 못한 상태입니다.
            그대로 진행하면 결제한 판매자가 있을 경우 <strong>전액 환불이 함께 실행</strong>됩니다.
            먼저 신청자 목록에서 결제 현황을 확인하시길 권합니다.
          </p>`;
      } else {
        body = `
          <p class="cancel-lead">이 마켓에는 아직 신청자가 없어요. 바로 취소할 수 있습니다.</p>
          <p class="cancel-warn">취소 후에는 되돌릴 수 없어요.</p>`;
      }

      const yesLabel = refundTotal > 0
        ? '예, 환불하고 취소합니다'
        : (previewFailed ? '확인했습니다, 취소합니다' : '예, 취소합니다');

      const overlay = document.createElement('div');
      overlay.className = 'cancel-modal-overlay';
      overlay.innerHTML = `
        <div class="cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
          <h3 id="cancel-modal-title">마켓을 취소할까요?</h3>
          ${body}
          <div class="cancel-modal-actions">
            <button type="button" class="btn btn-outline" data-answer="no">아니오</button>
            <button type="button" class="btn btn-danger" data-answer="yes">${yesLabel}</button>
          </div>
        </div>`;

      const close = (answer) => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(answer);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) return close(false); // 바깥 클릭 = 취소
        const btn = e.target.closest('[data-answer]');
        if (btn) close(btn.dataset.answer === 'yes');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      overlay.querySelector('[data-answer="no"]')?.focus();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 전체 흐름                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 미리보기 → 확인 → 취소까지 한 번에 처리합니다.
   * 화면 갱신과 메시지 표시는 부르는 쪽이 합니다. (화면마다 알림 방식이 달라서)
   *
   * @returns {Promise<{cancelled:boolean, message:string, type:'success'|'error', data:object|null}>}
   *   cancelled=false 면 사용자가 아니오를 눌렀거나 실패한 것입니다.
   */
  async function run(marketId) {
    if (!marketId) {
      return { cancelled: false, message: '마켓 정보를 찾을 수 없어요.', type: 'error', data: null };
    }

    // 1) 환불 예상 내역
    let preview = null;
    let previewFailed = false;
    try {
      const res = await fetchPreview(marketId);
      if (res && res.success) preview = res.data;
      else previewFailed = true;
    } catch (err) {
      previewFailed = true;
      console.error('취소 미리보기 실패:', err);
    }

    // 2) 확인
    const ok = await showConfirm(preview, previewFailed);
    if (!ok) return { cancelled: false, message: '', type: 'success', data: null };

    // 3) 실행
    try {
      const res = await requestCancel(marketId, true);
      if (!res || !res.success) {
        return {
          cancelled: false,
          message: res?.message || '취소에 실패했어요.',
          type: 'error',
          data: res?.data || null,
        };
      }

      const d = res.data || {};
      const base = d.refundedCount
        ? `마켓이 취소되었습니다. ${d.refundedCount}건 ${Number(d.refundedTotal || 0).toLocaleString()}원을 환불하고 신청자 ${d.notifiedCount}명에게 알렸어요.`
        : '마켓이 취소되었습니다.';
      const hasFail = Array.isArray(d.failed) && d.failed.length > 0;

      return {
        cancelled: true,
        message: hasFail
          ? `${base} 다만 ${d.failed.length}건의 환불이 실패했어요. 신청자 목록에서 「일괄 결제취소」로 다시 시도해주세요.`
          : base,
        type: hasFail ? 'error' : 'success',
        data: d,
      };
    } catch (err) {
      console.error('마켓 취소 실패:', err);
      return {
        cancelled: false,
        message: '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.',
        type: 'error',
        data: null,
      };
    }
  }

  window.MarketCancel = { run, showConfirm, fetchPreview, requestCancel };
})();
