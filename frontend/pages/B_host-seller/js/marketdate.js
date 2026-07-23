let today = new Date();
let tomorrow = new Date(today.setDate(today.getDate() + 1));
let year = tomorrow.getFullYear();
let month = String(tomorrow.getMonth() + 1).padStart(2, '0');
let day = String(tomorrow.getDate()).padStart(2, '0');
let minDate = `${year}-${month}-${day}`;

const startEventDateInput = document.getElementById('start-event-date');
const endEventDateInput = document.getElementById('end-event-date');
const startRecruitmentDateVal = document.getElementById('recruitmentDate_min');
const endRecruitmentDateVal = document.getElementById('recruitmentDate_max');

startEventDateInput.setAttribute('min', minDate);
endEventDateInput.setAttribute('min', minDate);

startEventDateInput.addEventListener('change', () => {
    const selectedStart = startEventDateInput.value;

    if (selectedStart) {
        endEventDateInput.setAttribute('min', selectedStart);
        if (endEventDateInput.value && endEventDateInput.value < selectedStart) {
            endEventDateInput.value = selectedStart;
        }
    }
})

startRecruitmentDateVal.setAttribute('min',minDate);
endRecruitmentDateVal.setAttribute('min',minDate);

startRecruitmentDateVal.addEventListener('change', () => {
    const selectedStart= startRecruitmentDateVal.value;

    if(selectedStart){
        endRecruitmentDateVal.setAttribute('min',selectedStart);
        if(endRecruitmentDateVal.value && endRecruitmentDateVal.value < selectedStart){
            endRecruitmentDateVal.value =selectedStart;
        }
    }
})