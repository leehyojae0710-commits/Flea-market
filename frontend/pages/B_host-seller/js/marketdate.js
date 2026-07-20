let today = new Date();
let tomorrow = new Date(today.setDate(today.getDate() + 1));
let year = tomorrow.getFullYear();
let month = String(tomorrow.getMonth() + 1).padStart(2, '0');
let day = String(tomorrow.getDate()).padStart(2, '0');
let minDate = `${year}-${month}-${day}`;

const startDateInput = document.getElementById('start-event-date');
const endDateInput = document.getElementById('end-event-date');

startDateInput.setAttribute('min', minDate);
endDateInput.setAttribute('min', minDate);

startDateInput.addEventListener('change', () => {
    const selectedStart = startDateInput.value;

    if (selectedStart) {
        endDateInput.setAttribute('min', selectedStart);
        if (endDateInput.value && endDateInput.value < selectedStart) {
            endDateInput.value = selectedStart;
        }
    }
})