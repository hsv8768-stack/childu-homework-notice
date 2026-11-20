
import { kv } from "@vercel/kv";
import { recentDates } from "./homeworkHistory";

// 최근 7일 기록을 조회합니다.
// 기록은 만료 여유를 두어 8일간 보관합니다.
const HISTORY_DAYS = 7;
const TTL_SECONDS = 60 * 60 * 24 * 8;

// 학생 고유 ID와 날짜로 저장 위치를 구분합니다.
function makeKey(studentPageId, date) {
  if (
    !studentPageId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(date))
  ) {
    throw new Error(
      "학생 ID 또는 기록 날짜가 올바르지 않습니다."
    );
  }

  return `childu:individual:v1:${encodeURIComponent(
    String(studentPageId)
  )}:${date}`;
}

// 노션의 데이터를 안전하게 문자열로 변환합니다.
function cleanValue(value) {
  return String(value ?? "").trim().slice(0, 4000);
}

// 학생별 개별 안내 정보를 정리합니다.
export function buildIndividualPayload(alert) {
  if (!alert) return null;

  return {
    word: cleanValue(alert.word),
    grammar: cleanValue(alert.grammar),
    retest: cleanValue(alert.retest),
    memo: cleanValue(alert.memo),
    individualNotice: cleanValue(
      alert.individualNotice
    ),
    individualHomework: cleanValue(
      alert.individualHomework
    ),
    homeworkStatus: cleanValue(
      alert.homeworkStatus
    )
  };
}

// 저장할 개인 기록이 있는지 확인합니다.
export function hasIndividualContent(payload) {
  return Object.values(payload || {}).some(
    (value) => value && value !== "-"
  );
}

// 학생별 날짜 기록 저장
export async function saveIndividualSnapshot(
  studentPageId,
  date,
  alert
) {
  const record = {
    date,
    alert: buildIndividualPayload(alert),
    savedAt: new Date().toISOString()
  };

  await kv.set(
    makeKey(studentPageId, date),
    record,
    { ex: TTL_SECONDS }
  );

  return record;
}

// 최근 7일 동안 저장된 개별 기록 조회
export async function getIndividualHistory(
  studentPageId,
  targetDate
) {
  const dates = recentDates(
    targetDate,
    HISTORY_DAYS
  );

  const records = await Promise.all(
    dates.map(async (date) => {
      const saved = await kv.get(
        makeKey(studentPageId, date)
      );

      if (!saved?.alert) return null;

      return {
        date,
        alert: buildIndividualPayload(
          saved.alert
        ),
        savedAt: saved.savedAt || null
      };
    })
  );

  return records.filter(Boolean);
}
