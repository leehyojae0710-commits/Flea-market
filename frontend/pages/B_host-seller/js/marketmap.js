document.addEventListener('DOMContentLoaded', function() {
  kakao.maps.load(function() {
    var mapContainer = document.getElementById('map-container'),
        mapOption = {
            center: new kakao.maps.LatLng(37.566826, 126.978656),
            level: 3
        };

    var map = new kakao.maps.Map(mapContainer, mapOption);
    var geocoder = new kakao.maps.services.Geocoder();
    var marker = new kakao.maps.Marker({ position: map.getCenter(), map: map });

    function updateFullAddress() {
      console.log("눌림");
      var address = document.getElementById('address').value;
      var detail = document.getElementById('detailAddress').value;
      var combined = detail ? `${address} ${detail}` : address;
      document.getElementById('fullAddress').value = combined;
    }

    window.execDaumPostcode = function() {
      new daum.Postcode({
        oncomplete: function (data) {
          var addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
          document.getElementById('postcode').value = data.zonecode;
          document.getElementById('address').value = addr;
          document.getElementById("detailAddress").focus();

          updateFullAddress();

          geocoder.addressSearch(addr, function(results, status) {
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
        }
      }).open();
    };

    document.getElementById('detailAddress').addEventListener('input', updateFullAddress);
    handleMarketCreateSubmit();
  });
});

document.getElementById('image-upload-btn').addEventListener('click', async() => {
  console.log('Image upload button clicked');
  const fileInput = document.getElementById('market-image');
  const file = fileInput.files[0];
  
  if (!file) {
    console.log('No file selected');
  }

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
      console.log('Image uploaded successfully:', data.filePath);
    }
    else {
      console.error('Image upload failed:', data.message);
    }
  } catch (error) {
    console.error('Error uploading image:', error);
  }
});