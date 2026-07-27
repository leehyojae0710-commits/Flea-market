// 메인 페이지 지역 지도 연동 모듈
// - 실제 대한민국 시·도 경계(kr-map-data.js)를 SVG로 그리고,
//   지역을 클릭하면 #region-filter 값을 바꿔 기존 필터 로직(main.js)이 그대로 동작하게 합니다.
// - 좌측 지역 목록 / 중앙 지도 어느 쪽을 눌러도 같은 지역이 선택·강조됩니다.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  let currentRegion = "";

  // 지역별 대표 색 (Image 2 톤 참고: 파스텔 채색)
  const REGION_COLORS = {
    서울: "#f0b7ac", 인천: "#d8c9a6", 경기: "#cdd6e2", 강원: "#e6d6a6",
    충북: "#cfc7b6", 충남: "#bcc7d6", 대전: "#d0bfa6", 세종: "#d6cebc",
    전북: "#cdb6c9", 전남: "#c4b2ce", 광주: "#bcaac6", 경북: "#cdd4b2",
    경남: "#bdccaa", 대구: "#c6cfa4", 울산: "#b4c4a2", 부산: "#accaa2", 제주: "#d6ac9c",
  };

  // 소형·밀집 지역 라벨은 지도 옆 여백으로 빼서 지시선으로 연결 (겹침 방지)
  // [dx, dy] = 지역 중심 기준 이동. leader:true 면 지시선을 그림.
  const LABEL_OFFSET = {
    // 수도권 (좌측 바다 여백 활용)
    인천: { dx: -72, dy: -6, leader: true },
    서울: { dx: -46, dy: 26, leader: true },
    경기: { dx: 30, dy: -6 },
    // 충청권
    세종: { dx: -82, dy: -30, leader: true },
    대전: { dx: -58, dy: 26, leader: true },
    // 호남권 (좌측 여백)
    광주: { dx: -62, dy: 6, leader: true },
    // 영남권 (우측 여백 활용)
    대구: { dx: 62, dy: -14, leader: true },
    울산: { dx: 56, dy: -2, leader: true },
    부산: { dx: 52, dy: 24, leader: true },
  };

  function getCountsByRegion(markets) {
    const counts = {};
    (markets || []).forEach((m) => {
      if (m && m.region) counts[m.region] = (counts[m.region] || 0) + 1;
    });
    return counts;
  }

  // ── SVG 지도 ────────────────────────────────────────────────
  function buildMapSvg(counts) {
    const data = window.KR_MAP_DATA;
    const svg = document.createElementNS(SVG_NS, "svg");
    if (!data) return svg;

    // 지도 영역(육지)은 viewBox 의 일부만 차지하므로, 실제 지도에 맞춰 잘라내고
    // 좌우에 라벨(특히 소형 지역)이 들어갈 여백을 둔다.
    // 육지 bbox: x -27~328, y 10~628
    const VB_X = -95;   // 왼쪽 라벨 자리
    const VB_Y = -6;
    const VB_W = 520;   // -95 ~ 425 (오른쪽 라벨 자리 확보)
    const VB_H = 646;
    svg.setAttribute("viewBox", `${VB_X} ${VB_Y} ${VB_W} ${VB_H}`);
    svg.setAttribute("class", "kr-map-svg");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "대한민국 지역 지도");

    // 지도 도형 레이어
    const shapeLayer = document.createElementNS(SVG_NS, "g");
    svg.appendChild(shapeLayer);
    // 라벨 레이어 (도형 위)
    const labelLayer = document.createElementNS(SVG_NS, "g");
    svg.appendChild(labelLayer);

    Object.keys(data.paths).forEach((region) => {
      const cnt = counts[region] || 0;
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "kr-region");
      g.setAttribute("data-region", region);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${region} ${cnt}개 행사`);

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", data.paths[region]);
      path.setAttribute("class", "kr-region-shape");
      path.style.setProperty("--region-fill", REGION_COLORS[region] || "#c9c9c9");
      g.appendChild(path);
      shapeLayer.appendChild(g);

      const [cx, cy] = data.labels[region] || [0, 0];
      const off = LABEL_OFFSET[region] || { dx: 0, dy: 0 };
      const lx = cx + (off.dx || 0);
      const ly = cy + (off.dy || 0);

      // 라벨을 지역 밖으로 뺀 경우 지시선(leader line)을 지역 중심까지 연결
      if (off.leader) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", cx);
        line.setAttribute("y1", cy);
        line.setAttribute("x2", lx);
        line.setAttribute("y2", ly);
        line.setAttribute("class", "kr-label-leader");
        line.dataset.region = region;
        labelLayer.appendChild(line);
      }

      // 라벨 배경 박스 + 텍스트 (Image 2 느낌)
      const label = document.createElementNS(SVG_NS, "g");
      label.setAttribute("class", "kr-region-label");
      label.setAttribute("data-region", region);
      label.setAttribute("transform", `translate(${lx},${ly})`);

      const nameW = Math.max(region.length * 15 + 16, 46);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", -nameW / 2);
      rect.setAttribute("y", -20);
      rect.setAttribute("width", nameW);
      rect.setAttribute("height", 40);
      rect.setAttribute("rx", 8);
      rect.setAttribute("class", "kr-label-box");
      label.appendChild(rect);

      const name = document.createElementNS(SVG_NS, "text");
      name.setAttribute("x", 0);
      name.setAttribute("y", -3);
      name.setAttribute("text-anchor", "middle");
      name.setAttribute("class", "kr-label-name");
      name.textContent = region;
      label.appendChild(name);

      const num = document.createElementNS(SVG_NS, "text");
      num.setAttribute("x", 0);
      num.setAttribute("y", 14);
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("class", "kr-label-count");
      num.textContent = `${cnt}개`;
      label.appendChild(num);

      labelLayer.appendChild(label);

      const select = () => selectRegion(region === currentRegion ? "" : region);
      g.addEventListener("click", select);
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });
      // 라벨을 눌러도 같은 지역 선택
      label.style.cursor = "pointer";
      label.addEventListener("click", select);
    });
    return svg;
  }

  // ── 좌측 지역 목록 ──────────────────────────────────────────
  function buildRegionList(counts) {
    const data = window.KR_MAP_DATA;
    const order = data ? Object.keys(data.paths) : Object.keys(counts);
    const wrap = document.createElement("ul");
    wrap.className = "kr-region-list";
    let total = 0;

    order.forEach((region) => {
      const cnt = counts[region] || 0;
      total += cnt;
      const li = document.createElement("li");
      li.className = "kr-region-list-item";
      li.dataset.region = region;
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.innerHTML =
        `<span class="krl-dot"></span>` +
        `<span class="krl-name">${region}</span>` +
        `<span class="krl-count">${cnt}</span>`;
      const select = () => selectRegion(region === currentRegion ? "" : region);
      li.addEventListener("click", select);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });
      wrap.appendChild(li);
    });

    const totalEl = document.getElementById("kr-total-count");
    if (totalEl) totalEl.textContent = total;
    return wrap;
  }

  // ── 지역 선택 → 기존 #region-filter 동기화 ──────────────────
  function selectRegion(regionKey) {
    currentRegion = regionKey || "";
    const select = document.getElementById("region-filter");
    if (select) {
      if (currentRegion && ![...select.options].some((o) => o.value === currentRegion)) {
        const opt = document.createElement("option");
        opt.value = currentRegion;
        opt.textContent = currentRegion;
        select.appendChild(opt);
      }
      select.value = currentRegion;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    highlightActive();
  }

  function highlightActive() {
    document.querySelectorAll(".kr-region").forEach((g) => {
      g.classList.toggle("is-active", g.dataset.region === currentRegion);
    });
    document.querySelectorAll(".kr-region-label").forEach((l) => {
      l.classList.toggle("is-active", l.dataset.region === currentRegion);
    });
    document.querySelectorAll(".kr-label-leader").forEach((l) => {
      l.classList.toggle("is-active", l.dataset.region === currentRegion);
    });
    document.querySelectorAll(".kr-region-list-item").forEach((li) => {
      li.classList.toggle("is-active", li.dataset.region === currentRegion);
    });
  }

  function render(markets) {
    const mapHost = document.getElementById("kr-map");
    const listHost = document.getElementById("kr-region-list-host");
    if (!mapHost || !listHost) return;
    const counts = getCountsByRegion(markets);
    mapHost.innerHTML = "";
    mapHost.appendChild(buildMapSvg(counts));
    listHost.innerHTML = "";
    listHost.appendChild(buildRegionList(counts));
    const select = document.getElementById("region-filter");
    currentRegion = (select && select.value) || "";
    highlightActive();
  }

  function bindSelectSync() {
    const select = document.getElementById("region-filter");
    if (!select) return;
    select.addEventListener("change", () => {
      currentRegion = select.value || "";
      highlightActive();
    });
  }

  window.RegionMap = { render, selectRegion, bindSelectSync };
  document.addEventListener("DOMContentLoaded", bindSelectSync);
})();
