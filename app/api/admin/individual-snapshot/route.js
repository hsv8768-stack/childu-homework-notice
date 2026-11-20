
import {
  getAlertFromPage,
  getStudentFromPage,
  isActiveStudent,
  normalizeLevel,
  notionQuery,
  todayKst
} from "../../_lib/notion";

import {
  buildIndividualPayload,
  hasIndividualContent,
  saveIndividualSnapshot
} from "../../_lib/individualHistory";

export const dynamic = "force-dynamic";

// 이름과 반 비교를 위한 함수
function compact(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

// 관리자 인증 확인
function authorized(body) {
  return Boolean(
    process.env.ADMIN_NAME &&
    process.env.ADMIN_PIN &&
    String(body.adminName || "").trim() ===
      process.env.ADMIN_NAME &&
    String(body.adminPin || "") ===
      process.env.ADMIN_PIN
  );
}

// 학생별 오늘의 개별 안내 찾기
function findAlertForStudent(alerts, student, date) {
  const rawLevel = compact(
    student.rawLevel || student.level
  );

  const baseLevel = compact(
    normalizeLevel(rawLevel)
  );

  const matches = alerts.filter(
    (alert) =>
      alert.public !== false &&
      String(alert.date || "").slice(0, 10) === date &&
      compact(alert.studentName) ===
        compact(student.name) &&
      [rawLevel, baseLevel].includes(
        compact(alert.rawLevel || alert.level)
      )
  );

  // 중복 기록이 있으면 마지막 수정 기록 우선
  return (
    matches.sort((a, b) => {
      const aExact =
        compact(a.rawLevel || a.level) === rawLevel
          ? 1
          : 0;

      const bExact =
        compact(b.rawLevel || b.level) === rawLevel
          ? 1
          : 0;

      if (aExact !== bExact) {
        return bExact - aExact;
      }

      return String(b.updatedAt || "").localeCompare(
        String(a.updatedAt || "")
      );
    })[0] || null
  );
}

// 관리자 전용 오늘 개인 기록 저장 API
export async function POST(request) {
  try {
    const body = await request.json();

    // 관리자 인증 필수
    if (!authorized(body)) {
      return Response.json(
        { error: "관리자 인증이 필요합니다." },
        { status: 401 }
      );
    }

    // 한국 시간 기준 오늘 날짜
    const date = todayKst();

    // 노션 학생 및 개인 안내 데이터 조회
    const [studentPages, alertPages] =
      await Promise.all([
        notionQuery(
          process.env.NOTION_STUDENTS_DB_ID
        ),
        notionQuery(
          process.env.NOTION_EXAM_ALERTS_DB_ID
        )
      ]);

    // 재원 학생 목록
    const students = studentPages
      .map((page) => ({
        ...getStudentFromPage(page),
        pageId: page.id
      }))
      .filter(
        (student) =>
          student.name &&
          student.pageId &&
          isActiveStudent(student.status)
      );

    // 개인 안내 목록
    const alerts = alertPages.map((page) => ({
      ...getAlertFromPage(page),
      updatedAt: page.last_edited_time || ""
    }));

    // 학생별 오늘 안내 연결
    const candidates = students
      .map((student) => {
        const alert = findAlertForStudent(
          alerts,
          student,
          date
        );

        return {
          student,
          payload: buildIndividualPayload(alert)
        };
      })
      .filter(({ payload }) =>
        hasIndividualContent(payload)
      );

    // 같은 반에 동명이인이 있으면 저장 제외
    const counts = new Map();

    for (const { student } of students.map(
      (student) => ({ student })
    )) {
      const key =
        `${compact(
          student.rawLevel || student.level
        )}::${compact(student.name)}`;

      counts.set(
        key,
        (counts.get(key) || 0) + 1
      );
    }

    const safeCandidates = candidates.filter(
      ({ student }) => {
        const key =
          `${compact(
            student.rawLevel || student.level
          )}::${compact(student.name)}`;

        return counts.get(key) === 1;
      }
    );

    // Vercel KV에 학생별 날짜 기록 저장
    let saved = 0;
    let failed = 0;

    for (
      let i = 0;
      i < safeCandidates.length;
      i += 8
    ) {
      const batch = safeCandidates.slice(
        i,
        i + 8
      );

      const results = await Promise.allSettled(
        batch.map(({ student, payload }) =>
          saveIndividualSnapshot(
            student.pageId,
            date,
            payload
          )
        )
      );

      saved += results.filter(
        (result) =>
          result.status === "fulfilled"
      ).length;

      failed += results.filter(
        (result) =>
          result.status === "rejected"
      ).length;
    }

    // 저장 결과 반환
    return Response.json({
      date,
      totalStudents: students.length,
      matched: candidates.length,
      saved,
      failed,
      skipped: students.length - saved,
      message: failed
        ? "일부 기록 저장에 실패했습니다."
        : "오늘 개인 기록 저장을 마쳤습니다."
    });
  } catch (error) {
    console.error(
      "Failed to save individual snapshots:",
      error?.name || "Error"
    );

    return Response.json(
      { error: "개인 기록 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
