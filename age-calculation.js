// Calendar months are measured from DOB, clamping to the month's last day.
// A 29 February birthday falls on 28 February in non-leap years.
function getCalendarAge(birthDate, tillDate){
  const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const anniversary = (months) => {
    const date = new Date(birthDate.getFullYear(), birthDate.getMonth() + months, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(birthDate.getDate(), lastDay));
    return date;
  };
  let completeMonths = (tillDate.getFullYear() - birthDate.getFullYear()) * 12 + tillDate.getMonth() - birthDate.getMonth();
  if(dayNumber(anniversary(completeMonths)) > dayNumber(tillDate)){ completeMonths -= 1; }
  const years = Math.floor(completeMonths / 12);
  const days = dayNumber(tillDate) - dayNumber(anniversary(completeMonths));
  const birthdayToday = completeMonths % 12 === 0 && days === 0;
  const nextBirthday = anniversary((years + 1) * 12);
  const daysUntilBirthday = dayNumber(nextBirthday) - dayNumber(tillDate);
  return {
    years, months:completeMonths % 12, days,
    totalDays:dayNumber(tillDate) - dayNumber(birthDate),
    birthdayText:birthdayToday
      ? `Aaj ${years} saal poore ho gaye. Agle birthday mein ${daysUntilBirthday} din baaki hain.`
      : `${years + 1} saal poore hone mein ${daysUntilBirthday} din baaki ${daysUntilBirthday === 1 ? "hai" : "hain"}.`
  };
}
