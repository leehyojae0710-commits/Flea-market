document.addEventListener('DOMContentLoaded', function () {
  kakao.maps.load(function () {
    var mapContainer = document.getElementById('map-container'),
      mapOption = {
        center: new kakao.maps.LatLng(37.566826, 126.978656),
        level: 3
      };

    var map = new kakao.maps.Map(mapContainer, mapOption);
    var geocoder = new kakao.maps.services.Geocoder();
    var marker = new kakao.maps.Marker({ position: map.getCenter(), map: map });

    function updateFullAddress() {
      if (!document.getElementById('address') || !document.getElementById('detailAddress')) {
        return;
      }
      console.log("눌림");
      var address = document.getElementById('address').value;
      var detail = document.getElementById('detailAddress').value;
      var combined = detail ? `${address} ${detail}` : address;
      document.getElementById('fullAddress').value = combined;
    }
    let isPostcodeOpen = false;
    const str = document.getElementById('button_hint');
    window.execDaumPostcode = function () {
      if (isPostcodeOpen) {
        str.textContent = "이미 우편번호 찾기 창이 열려 있어요.";
        str.style.color = "red";
        return;
      }
      isPostcodeOpen = true;
      new daum.Postcode({
        oncomplete: (data) => {
          var addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
          document.getElementById('postcode').value = data.zonecode;
          document.getElementById('address').value = addr;
          document.getElementById("detailAddress").focus();

          updateFullAddress();

          geocoder.addressSearch(addr, function (results, status) {
            if (status === kakao.maps.services.Status.OK) {
              var result = results[0];
              var coords = new kakao.maps.LatLng(result.y, result.x);

              mapContainer.style.display = "block";
              map.relayout();
              map.setCenter(coords);
              marker.setPosition(coords);

              document.getElementById('latitude').value = result.y;
              document.getElementById('longitude').value = result.x;
              document.getElementById('region').value = result.address.region_1depth_name;
            }
          });
        },
        onclose: () => {
          str.textContent = "";
          str.style.color = "black";
          isPostcodeOpen = false;
        }
      }).open();
    };

    document.getElementById('detailAddress').addEventListener('input', updateFullAddress);
  });
});