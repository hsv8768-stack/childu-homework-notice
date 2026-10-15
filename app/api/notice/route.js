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

import {
  saveCheckRecord
} from "../_lib/checkHistory";

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

  /*
    예:
    GR103 학생
    → GR103만 사용

    GR103(1) 학생
    → GR103(1)이 있으면 우선 사용
    → GR103(1)이 없고 GR103 공통 숙제가 있으면 GR103 사용
  */
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

    // 1. 학생 정보 확인
    const studentPages = await notionQuery(
      process.env.NOTION_STUDENTS_DB_ID
    );

    const students = studentPages
      .map(getStudentFromPage)
      .filter(
        (student) =>
          student.name && isActiveStudent(student.status)
      );

    const requestedName = compactName(studentName);

    const sameNameStudents = students.filter(
      (student) =>
        compactName(student.name) === requestedName
    );

    if (sameNameStudents.length === 0) {
      return Response.json(
        {
          error:
            "학생 정보를 찾을 수 없습니다. 이름을 다시 확인해 주세요."
        },
        { status: 404 }
      );
    }

    const student = sameNameStudents.find(
      (student) => student.pin === pin
    );

    if (!student) {
      return Response.json(
        { error: "확인번호를 다시 확인해 주세요." },
        { status: 401 }
      );
    }

    const studentRawLevel = String(
      student.rawLevel || student.level || ""
    ).trim();

    const studentBaseLevel =
      normalizeLevel(studentRawLevel);

    // 2. 반별 숙제 불러오기
    const homeworkPages = await notionQuery(
      process.env.NOTION_HOMEWORK_DB_ID
    );

    const homeworkItems = homeworkPages
      .map(getHomeworkFromPage)
      .filter(
        (homework) => homework.public !== false
      );

    const homework = pickHomeworkForStudent(
      homeworkItems,
      studentRawLevel,
      targetDate
    );

    const homeworkPayload =
      makeHomeworkPayload(homework);

    const homeworkDate =
      homework?.date || targetDate;

    const selectedHomeworkRawLevel =
      rawLevelOf(homework);

    const selectedHomeworkLevelForHistory =
      compactLevel(selectedHomeworkRawLevel) ===
      compactLevel(studentRawLevel)
        ? studentRawLevel
        : studentBaseLevel;

    // 3. 숙제 기록 저장
    if (homeworkPayload) {
      await saveHomeworkSnapshot(
        selectedHomeworkLevelForHistory,
        homeworkDate,
        homeworkPayload
      );
    }

    // 4. 최근 숙제 기록 불러오기
    const baseHistory =
      await getHomeworkHistory(
        studentBaseLevel,
        targetDate
      );

    const exactHistory =
      compactLevel(studentRawLevel) !==
      compactLevel(studentBaseLevel)
        ? await getHomeworkHistory(
            studentRawLevel,
            targetDate
          )
        : [];

    const mergedSavedHistory =
      mergeHistoryItems(
        baseHistory,
        exactHistory
      );

    const homeworkHistory =
      mergeHistoryWithToday(
        mergedSavedHistory,
        homeworkDate,
        homeworkPayload
      );

    // 5. 개별 단어 / 문법·독해 / 재시험 안내 불러오기
    const alertPages = await notionQuery(
      process.env.NOTION_EXAM_ALERTS_DB_ID
    );

    const alertItems = alertPages
      .map(getAlertFromPage)
      .filter(
        (alert) => alert.public !== false
      )
      .filter(
        (alert) =>
          compactName(alert.studentName) ===
          compactName(student.name)
      )
      .filter((alert) =>
        levelMatchesExactOrBase(
          alert.rawLevel || alert.level,
          studentRawLevel
        )
      );

    const alert =
      latestByDate(alertItems, targetDate);

    /*
      6. 학부모 숙제 안내장 확인 기록 저장

      여기까지 왔다는 것은
      학생 이름 + 보호자 확인번호가 모두 일치해서
      실제 안내장을 정상적으로 열었다는 뜻입니다.

      보호자 확인번호 자체는 저장하지 않습니다.
    */
    await saveCheckRecord({
      studentName: student.name,
      level: studentRawLevel,
      homeworkDate
    });

    // 7. 학부모 화면으로 최종 데이터 전달
    return Response.json({
      source: "notion",

      studentName: student.name,

      date:
        homeworkDate ||
        alert?.date ||
        targetDate,

      alert: alert
        ? {
            word: alert.word || "-",
            grammar: alert.grammar || "-",
            retest: alert.retest || "-",
            memo: alert.memo || "",
            individualNotice:
              alert.individualNotice || "",
            individualHomework:
              alert.individualHomework || "",
            homeworkStatus:
              alert.homeworkStatus || ""
          }
        : null,

      homework: homeworkPayload,

      homeworkHistory
    });
  } catch (error) {
    return Response.json(
      {
        error:
          "안내장을 불러오지 못했습니다.",
        detail: String(
          error?.message || error
        )
      },
      { status: 500 }
    );
  }
}
