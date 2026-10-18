// Дни рождения питомцев: событие на весь день каждый год по birth_date.
// Правила совпадают с бэкендом (app/services/birthdays.py): первое событие через год
// после рождения, родившиеся 29 февраля празднуют 28-го в невисокосный год.

export type Birthday = { date: string; age: number };

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function yearsWord(age: number) {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "года";
  return "лет";
}

export function birthdayTitle(age: number) {
  return age === 0 ? "День рождения" : `День рождения, ${age} ${yearsWord(age)}`;
}

/** Праздничная аватарка нужна и в сам день рождения, до первой годовщины. */
export function birthdayOnDate(birthDate: string, today: string): Birthday | null {
  if (birthDate > today) return null;
  const [birthYear, month, day] = birthDate.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  const actualDay = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
  return date === today ? { date, age: year - birthYear } : null;
}

/** Дни рождения в диапазоне дат YYYY-MM-DD (включительно). */
export function birthdaysBetween(birthDate: string, from: string, to: string): Birthday[] {
  const [birthYear, month, day] = birthDate.split("-").map(Number);
  const result: Birthday[] = [];
  for (let year = Math.max(Number(from.slice(0, 4)), birthYear + 1); year <= Number(to.slice(0, 4)); year += 1) {
    const actualDay = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
    if (date >= from && date <= to) result.push({ date, age: year - birthYear });
  }
  return result;
}
