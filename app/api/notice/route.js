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

import {
  getHomeworkHistory,
  saveHomeworkSnapshot
} from "../_lib/homeworkHistory";

export const dynamic = "force-dynamic";

function compactName(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function compactLevel(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function rawLevelOf(item) {
  return String(item?.rawLevel || item?.level || "").trim();
}

function makeHomeworkPayload(homework) {
  if (!homework) return null;

  return {
    previous: homework.previous || "-",
    word: homework.word || "-",
    grammar: homework.grammar || "-",
    notice: homework.notice || "-",
    todayClass: homework.todayClass || "-",
    homework: homework.homework || "-",
    online: homework.online || "-"
  };
}

function pickHomeworkForStudent(homeworkItems, studentRawLevel, targetDate) {
  const studentExactLevel = compactLevel(studentRawLevel);
  const studentBaseLevel = compactLevel(normalizeLevel(studentRawLevel));

  const exactItems = homeworkItems.filter(
    (homework) => compactLevel(rawLevelOf(homework)) === studentExactLevel
  );

  const baseItems = homeworkItems.filter(
    (homework) => compactLevel(rawLevelOf(homework)) === studentBaseLevel
  );

  const exactHomework = latestByDate(exactItems, targetDate);
  const baseHomework = latestByDate(baseItems, targetDate);

  // 원칙:
  // 1. GR103(1)처럼 학생의 정확한 레벨 숙제가 있으면 그걸 우선 사용
  // 2. 단, 정확한 레벨 숙제가 오래된 날짜이고, GR103 공통 숙제가 더 최신이면 공통 숙제 사용
  // 3. GR103 학생은 GR103(1) 숙제를 가져가지 않음
  if (exactHomework && baseHomework) {
    const exactDate = String(exactHomework.date || "");
    const baseDate = String(baseHomework.date || "");

    if (exactDate >= baseDate) {
      return exactHomework;
    }

    return baseHomework;
  }

  return exactHomework || baseHomework || null;
}

function levelMatchesExactOrBase(itemRawLevel, studentRawLevel) {
  const itemLevel = compactLevel(itemRawLevel);
  const exactLevel = compactLevel(studentRawLevel);
  const baseLevel = compactLevel(normalizeLevel(studentRawLevel));

  if (!itemLevel) return true;

  return itemLevel === exactLevel || itemLevel === baseLevel;
}

function mergeHistoryItems(...histories) {
  const map = new Map();

  for (const history of histories) {
    for (const item of history || []) {
      if (!item?.date || !item?.homework) continue;

      map.set(item.date, {
        date: item.date,
        homework: item.homework
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 7);
}

function mergeHistoryWithToday(history, todayDate, todayHomework) {
  const map = new Map();

  for (const item of history || []) {
    if (!item?.date || !item?.homework) continue;

    map.set(item.date, item);
  }

  if (todayHomework && todayDate) {
    map.set(todayDate, {
      date: todayDate,
      homework: todayHomework
    });
  }

  return Array.from(map.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 7);
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
          studentName,
          homeworkHistory: []
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

    const studentRawLevel = String(student.rawLevel || student.level || "").trim();
    const studentBaseLevel = normalizeLevel(studentRawLevel);

    // 2. 반별 숙제 불러오기
    const homeworkPages = await notionQuery(process.env.NOTION_HOMEWORK_DB_ID);

    const homeworkItems = homeworkPages
      .map(getHomeworkFromPage)
      .filter((homework) => homework.public !== false);

    const homework = pickHomeworkForStudent(
      homeworkItems,
      studentRawLevel,
      targetDate
    );

    const homeworkPayload = makeHomeworkPayload(homework);
    const homeworkDate = homework?.date || targetDate;

    const selectedHomeworkRawLevel = rawLevelOf(homework);
    const selectedHomeworkLevelForHistory =
      compactLevel(selectedHomeworkRawLevel) === compactLevel(studentRawLevel)
        ? studentRawLevel
        : studentBaseLevel;

    // 3. 오늘 숙제를 사이트 저장소에 8일 동안 저장
    if (homeworkPayload) {
      await saveHomeworkSnapshot(
        selectedHomeworkLevelForHistory,
        homeworkDate,
        homeworkPayload
      );
    }

    // 4. 최근 7일 숙제 기록 불러오기
    // GR103(1) 학생은 GR103 공통 숙제 기록 + GR103(1) 개별 숙제 기록을 함께 봅니다.
    // 단, 같은 날짜에 둘 다 있으면 GR103(1) 개별 숙제가 우선됩니다.
    const baseHistory = await getHomeworkHistory(studentBaseLevel, targetDate);

    const exactHistory =
      compactLevel(studentRawLevel) !== compactLevel(studentBaseLevel)
        ? await getHomeworkHistory(studentRawLevel, targetDate)
        : [];

    const mergedSavedHistory = mergeHistoryItems(baseHistory, exactHistory);

    const homeworkHistory = mergeHistoryWithToday(
      mergedSavedHistory,
      homeworkDate,
      homeworkPayload
    );

    // 5. 개별 단어/문법/개별 안내 불러오기
    const alertPages = await notionQuery(process.env.NOTION_EXAM_ALERTS_DB_ID);

    const alertItems = alertPages
      .map(getAlertFromPage)
      .filter((alert) => alert.public !== false)
      .filter(
        (alert) => compactName(alert.studentName) === compactName(student.name)
      )
      .filter((alert) =>
        levelMatchesExactOrBase(alert.rawLevel || alert.level, studentRawLevel)
      );

    const alert = latestByDate(alertItems, targetDate);

    return Response.json({
      source: "notion",
      studentName: student.name,
      date: homeworkDate || alert?.date || targetDate,

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

      homework: homeworkPayload,

      homeworkHistory
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
