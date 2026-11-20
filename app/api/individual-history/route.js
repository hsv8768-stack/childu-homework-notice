
import {
  getStudentFromPage,
  isActiveStudent,
  notionQuery,
  todayKst
} from "../_lib/notion";

import {
  getIndividualHistory
} from "../_lib/individualHistory";

export const dynamic = "force-dynamic";

// 학생 이름 비교
function compact(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .trim();
}

// 개인별 최근 7일 기록 불러오기
export async function POST(request) {
  try {
    const body = await request.json();

    const studentName = compact(body.studentName);
    const pin = String(body.pin || "").trim();

    // 학생 정보 입력 확인
    if (!studentName || !/^\d{4}$/.test(pin)) {
      return Response.json(
        { error: "학생 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 노션 학생 데이터 조회
    const pages = await notionQuery(
      process.env.NOTION_STUDENTS_DB_ID
    );

    // 이름과 보호자 확인번호가 일치하는 학생 검색
    const matches = pages
      .map((page) => ({
        ...getStudentFromPage(page),
        pageId: page.id
      }))
      .filter(
        (student) =>
          isActiveStudent(student.status) &&
          compact(student.name) === studentName &&
          student.pin === pin
      );

    // 정확하게 한 명만 일치해야 조회 가능
    if (matches.length !== 1) {
      return Response.json(
        { error: "학생 정보를 확인할 수 없습니다." },
        { status: 401 }
      );
    }

    // 해당 학생의 최근 7일 개인 기록 조회
    const history = await getIndividualHistory(
      matches[0].pageId,
      todayKst()
    );

    return Response.json(
      { history },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );

  } catch (error) {
    console.error(
      "Failed to load individual history:",
      error?.name || "Error"
    );

    return Response.json(
      { error: "개별 기록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
