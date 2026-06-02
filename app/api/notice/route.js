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

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedLevel = normalizeLevel(body.level);
    const studentName = String(body.studentName || "").trim();
    const pin = String(body.pin || "").trim();

    if (!studentName || !pin) {
      return Response.json({ error: "학생명과 확인번호가 필요합니다." }, { status: 400 });
    }

    if (!envReady()) {
      if (pin.length >= 4) {
        return Response.json({ source: "sample", ...sampleNotice, studentName, level: requestedLevel || sampleNotice.level });
      }
      return Response.json({ error: "확인번호를 다시 확인해주세요." }, { status: 401 });
    }

    const studentsPages = await notionQuery(process.env.NOTION_STUDENTS_DB_ID);
    const students = studentsPages.map(getStudentFromPage).filter(s => s.name && isActiveStudent(s.status));

    const student = students.find(s =>
      s.name === studentName &&
      (!requestedLevel || s.level === requestedLevel || normalizeLevel(s.rawLevel) === requestedLevel)
    );

    if (!student) return Response.json({ error: "학생 정보를 찾을 수 없습니다." }, { status: 404 });
    if (!student.pin) return Response.json({ error: "아직 확인번호가 등록되지 않았습니다." }, { status: 401 });
    if (student.pin !== pin) return Response.json({ error: "확인번호를 다시 확인해주세요." }, { status: 401 });

    const targetDate = todayKst();

    const homeworkPages = await notionQuery(process.env.NOTION_HOMEWORK_DB_ID);
    const homeworkItems = homeworkPages
      .map(getHomeworkFromPage)
      .filter(h => h.public !== false)
      .filter(h => h.level === student.level || h.level === requestedLevel || h.level === normalizeLevel(student.rawLevel));

    const homework = latestByDate(homeworkItems, targetDate);

    const alertPages = await notionQuery(process.env.NOTION_EXAM_ALERTS_DB_ID);
    const alertItems = alertPages
      .map(getAlertFromPage)
      .filter(a => a.public !== false)
      .filter(a => a.studentName === student.name)
      .filter(a => !a.level || a.level === student.level || a.level === requestedLevel || a.level === normalizeLevel(student.rawLevel));

    const alert = latestByDate(
      homework?.date ? alertItems.filter(a => String(a.date).slice(0, 10) === String(homework.date).slice(0, 10)) : alertItems,
      targetDate
    );

    return Response.json({
      source: "notion",
      studentName: student.name,
      level: student.level,
      date: homework?.date || targetDate,
      alert: alert ? {
        word: alert.word || "-",
        grammar: alert.grammar || "-",
        retest: alert.retest || "-",
        memo: alert.memo || ""
      } : null,
      homework: homework ? {
        previous: homework.previous || "-",
        word: homework.word || "-",
        grammar: homework.grammar || "-",
        notice: homework.notice || "-",
        todayClass: homework.todayClass || "-",
        homework: homework.homework || "-",
        online: homework.online || "-"
      } : null
    });
  } catch (error) {
    return Response.json(
      { error: "안내장을 불러오지 못했습니다.", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
