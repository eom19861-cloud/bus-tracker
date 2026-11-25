// 수집 시간대(한국 시간) 정책.
// 집 정류장은 아침 출근 시간대에만, 회사 정류장은 저녁 퇴근 시간대에만 관측한다.
// 시간대 밖에서 크론이 불리면(지연·수동 실행 등) 정류장 조회 없이 바로 건너뛴다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const COLLECTION_WINDOWS = [
  { role: 'home', startHour: 5, endHour: 7 }, // 평일 05:00 ~ 07:00 KST
  { role: 'work', startHour: 16, endHour: 18 }, // 평일 16:00 ~ 18:00 KST
];

/** 지금의 한국 시각 시(0~23). */
export function kstHour(now = Date.now()) {
  return new Date(now + KST_OFFSET_MS).getUTCHours();
}

/** 지금 수집해야 할 정류장 role('home' | 'work'). 시간대 밖이면 null. */
export function collectionRoleAt(now = Date.now()) {
  const hour = kstHour(now);
  const window = COLLECTION_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour);
  return window ? window.role : null;
}
