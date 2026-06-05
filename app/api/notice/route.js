import {
  envReady,
  getAlertFromPage,
  getHomeworkFromPage,
  getStudentFromPage,
  isActiveStudent,
  latestByDate,
  notionQuery,
  normalizeLevel,
  sampleNotice,
  todayKst
} from "../_lib/notion";

export const dynamic = "force-dynamic";

function compactName(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json();

    const studentName = String(body.studentName || "").trim();
    const pin = String(body.pin || "").trim();

    if (!studentName || !pin) {
      return Response.json(
        { error: "학생 이름과 확인번호를 입력해 주세요." },
        { status: 400 }
      );
    }

    if (!envReady()) {
      if (pin.length >= 4) {
        return Response.json({
          source: "sample",
          ...sampleNotice,
          studentName
        });
      }

      return Response.json(
        { error: "확인번호를 다시 확인해 주세요." },
        { status: 401 }
      );
    }

    const targetDate = todayKst();

    // 1. 학생목록에서 학생 이름 + 확인번호 확인
    const studentPages = await notionQuery(process.env.NOTION_STUDENTS_DB_ID);

    const students = studentPages
      .map(getStudentFromPage)
      .filter((student) => student.name && isActiveStudent(student.status));

    const requestedName = compactName(studentName);

    const sameNameStudents = students.filter(
      (student) => compactName(student.name) === requestedName
    );

    if (sameNameStudents.length === 0) {
      return Response.json(
        { error: "학생 정보를 찾을 수 없습니다. 이름을 다시 확인해 주세요." },
        { status: 404 }
      );
    }

    const student = sameNameStudents.find((student) => student.pin === pin);

    if (!student) {
      return Response.json(
        { error: "확인번호를 다시 확인해 주세요." },
        { status: 401 }
      );
    }

    const studentLevel = normalizeLevel(student.rawLevel || student.level);

    // 2. 반별 숙제 불러오기
    const homeworkPages = await notionQuery(process.env.NOTION_HOMEWORK_DB_ID);

    const homeworkItems = homeworkPages
      .map(getHomeworkFromPage)
      .filter((homework) => homework.public !== false)
      .filter((homework) => {
        const homeworkLevel = normalizeLevel(homework.rawLevel || homework.level);
        return homeworkLevel === studentLevel;
      });

    const homework = latestByDate(homeworkItems, targetDate);

    // 3. 개별 단어/문법/개별 안내 불러오기
    const alertPages = await notionQuery(process.env.NOTION_EXAM_ALERTS_DB_ID);

    const alertItems = alertPages
      .map(getAlertFromPage)
      .filter((alert) => alert.public !== false)
      .filter(
        (alert) => compactName(alert.studentName) === compactName(student.name)
      )
      .filter((alert) => {
        const alertLevel = normalizeLevel(alert.rawLevel || alert.level);

        // 레벨/반이 비어 있으면 이름만 맞아도 허용
        if (!alertLevel) return true;

        // 레벨/반이 있으면 학생 레벨과 같을 때만 허용
        return alertLevel === studentLevel;
      });

    // 반별 숙제 날짜와 무조건 같아야 하는 구조가 아니라,
    // 해당 학생의 오늘 또는 가장 최근 공개 개별 알림을 표시합니다.
    const alert = latestByDate(alertItems, targetDate);

    return Response.json({
      source: "notion",
      studentName: student.name,
      date: homework?.date || alert?.date || targetDate,

      alert: alert
        ? {
            word: alert.word || "-",
            grammar: alert.grammar || "-",
            retest: alert.retest || "-",
            memo: alert.memo || "",
            individualNotice: alert.individualNotice || "",
            individualHomework: alert.individualHomework || "",
            homeworkStatus: alert.homeworkStatus || ""
          }
        : null,

      homework: homework
        ? {
            previous: homework.previous || "-",
            word: homework.word || "-",
            grammar: homework.grammar || "-",
            notice: homework.notice || "-",
            todayClass: homework.todayClass || "-",
            homework: homework.homework || "-",
            online: homework.online || "-"
          }
        : null
    });
  } catch (error) {
    return Response.json(
      {
        error: "안내장을 불러오지 못했습니다.",
        detail: String(error?.message || error)
      },
      { status: 500 }
    );
  }
}
