import { kv } from "@vercel/kv";

const CHECK_TTL_SECONDS = 60 * 60 * 24 * 8;

// 한국 날짜 구하기
function todayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 학생 이름 비교용
function compactName(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .trim();
}

// 반 이름 비교용
function compactLevel(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .trim();
}

// 날짜별 확인 기록 저장소 이름
function checkKey(date) {
  return `childu:check:${date}`;
}

// 학생별 저장 위치
function studentField(studentName, level) {
  return `${compactLevel(level)}::${compactName(studentName)}`;
}

/**
 * 학부모님이 숙제 안내장을 정상적으로 열었을 때 호출
 */
export async function saveCheckRecord({
  studentName,
  level,
  homeworkDate
}) {
  if (!studentName || !level) return;

  try {
    const checkedDate = todayKst();

    const record = {
      studentName: String(studentName).trim(),
      level: String(level).trim(),

      // 실제로 안내장을 확인한 날짜
      checkedDate,

      // 실제 확인 시각
      checkedAt: new Date().toISOString(),

      // 학부모님이 확인한 숙제 날짜
      homeworkDate: homeworkDate || checkedDate
    };

    const key = checkKey(checkedDate);
    const field = studentField(studentName, level);

    await kv.hset(key, {
      [field]: JSON.stringify(record)
    });

    // 확인 기록은 8일 뒤 자동 삭제
    await kv.expire(key, CHECK_TTL_SECONDS);
  } catch (error) {
    // 확인 기록 저장 실패가 학부모 숙제 확인을 막으면 안 되므로
    // 오류만 기록하고 사이트는 정상 작동하도록 합니다.
    console.error("Failed to save check record:", error);
  }
}

/**
 * 관리자 화면에서 특정 날짜의 확인 기록을 불러올 때 사용
 */
export async function getCheckRecords(date) {
  if (!date) return [];

  try {
    const saved = await kv.hgetall(checkKey(date));

    if (!saved) return [];

    return Object.values(saved)
      .map((value) => {
        try {
          if (typeof value === "string") {
            return JSON.parse(value);
          }

          return value;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Failed to load check records:", error);
    return [];
  }
}
