import {
  getStudentFromPage,
  isActiveStudent,
  notionQuery,
  todayKst
} from "../../_lib/notion";

import {
  getCheckRecords
} from "../../_lib/checkHistory";

export const dynamic = "force-dynamic";

function compactName(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .trim();
}

function compactLevel(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .trim();
}

function studentKey(name, level) {
  return `${compactLevel(level)}::${compactName(name)}`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function POST(request) {
  try {
    const body = await request.json();

    const adminName = String(body.adminName || "").trim();
    const adminPin = String(body.adminPin || "").trim();
    const requestedDate = String(body.date || "").trim();
    const requestedLevel = String(body.level || "").trim();

    // 1. 관리자 환경변수가 설정되어 있는지 확인
    if (!process.env.ADMIN_NAME || !process.env.ADMIN_PIN) {
      return Response.json(
        {
          error: "관리자 로그인 정보가 설정되어 있지 않습니다."
        },
        { status: 500 }
      );
    }

    // 2. 관리자 아이디 / 비밀번호 확인
    if (
      adminName !== process.env.ADMIN_NAME ||
      adminPin !== process.env.ADMIN_PIN
    ) {
      return Response.json(
        {
          error: "관리자 이름 또는 비밀번호를 다시 확인해 주세요."
        },
        { status: 401 }
      );
    }

    // 3. 조회 날짜 결정
    const targetDate =
      requestedDate && isValidDate(requestedDate)
        ? requestedDate
        : todayKst();

    // 4. 노션 학생목록에서 현재 재원생 불러오기
    const studentPages = await notionQuery(
      process.env.NOTION_STUDENTS_DB_ID
    );

    let students = studentPages
      .map(getStudentFromPage)
      .filter(
        (student) =>
          student.name &&
          isActiveStudent(student.status)
      )
      .map((student) => ({
        name: String(student.name || "").trim(),
        level: String(
          student.rawLevel || student.level || ""
        ).trim(),
        grade: String(student.grade || "").trim()
      }))
      .filter(
        (student) =>
          student.name &&
          student.level
      );

    // 5. 특정 반을 선택했다면 그 반 학생만 남기기
    if (requestedLevel) {
      students = students.filter(
        (student) =>
          compactLevel(student.level) ===
          compactLevel(requestedLevel)
      );
    }

    // 6. 해당 날짜의 숙제톡 확인 기록 불러오기
    const checkRecords =
      await getCheckRecords(targetDate);

    const checkMap = new Map();

    for (const record of checkRecords || []) {
      if (!record?.studentName || !record?.level) {
        continue;
      }

      const key = studentKey(
        record.studentName,
        record.level
      );

      checkMap.set(key, record);
    }

    // 7. 학생별 확인 / 미확인 판별
    const studentResults = students.map(
      (student) => {
        const key = studentKey(
          student.name,
          student.level
        );

        const record = checkMap.get(key);

        return {
          name: student.name,
          level: student.level,
          grade: student.grade,

          checked: Boolean(record),

          checkedAt:
            record?.checkedAt || null,

          checkedDate:
            record?.checkedDate || null,

          homeworkDate:
            record?.homeworkDate || null
        };
      }
    );

    // 8. 반 이름 목록 만들기
    const levels = Array.from(
      new Set(
        studentResults
          .map((student) => student.level)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      String(a).localeCompare(
        String(b),
        "ko"
      )
    );

    // 9. 반별로 묶기
    const grouped = {};

    for (const student of studentResults) {
      if (!grouped[student.level]) {
        grouped[student.level] = [];
      }

      grouped[student.level].push(student);
    }

    // 학생 이름순 정렬
    for (const level of Object.keys(grouped)) {
      grouped[level].sort((a, b) =>
        String(a.name).localeCompare(
          String(b.name),
          "ko"
        )
      );
    }

    // 10. 전체 확인 인원 계산
    const totalCount = studentResults.length;

    const checkedCount =
      studentResults.filter(
        (student) => student.checked
      ).length;

    const uncheckedCount =
      totalCount - checkedCount;

    return Response.json({
      success: true,

      date: targetDate,

      selectedLevel:
        requestedLevel || "",

      summary: {
        total: totalCount,
        checked: checkedCount,
        unchecked: uncheckedCount
      },

      levels,

      students: studentResults,

      grouped
    });
  } catch (error) {
    console.error(
      "Admin check API error:",
      error
    );

    return Response.json(
      {
        error:
          "숙제 확인 현황을 불러오지 못했습니다.",
        detail: String(
          error?.message || error
        )
      },
      { status: 500 }
    );
  }
}
