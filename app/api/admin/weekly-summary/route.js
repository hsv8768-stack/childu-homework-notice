import { timingSafeEqual } from "node:crypto";
import { kv } from "@vercel/kv";

import {
  getAlertFromPage,
  getStudentFromPage,
  isActiveStudent,
  normalizeLevel,
  notionQuery,
  todayKst
} from "../../_lib/notion";

import {
  getIndividualHistory
} from "../../_lib/individualHistory";

import {
  getHomeworkHistory,
  recentDates
} from "../../_lib/homeworkHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CALLS_PER_DAY = 150;
const DAYS = 7;

function sameSecret(input, secret) {
  const a = Buffer.from(String(input ?? ""));
  const b = Buffer.from(String(secret ?? ""));

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

function isAdmin(body) {
  return Boolean(
    process.env.ADMIN_NAME &&
    process.env.ADMIN_PIN &&
    sameSecret(
      String(body?.adminName ?? "").trim(),
      process.env.ADMIN_NAME
    ) &&
    sameSecret(
      body?.adminPin,
      process.env.ADMIN_PIN
    )
  );
}

function compact(value) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .trim();
}

function clean(value, studentName) {
  let result = String(value ?? "")
    .trim()
    .slice(0, 1200);

  if (!result || result === "-") return "";

  if (studentName) {
    result = result
      .split(studentName)
      .join("[학생]");
  }

  return result
    .replace(
      /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,
      "[전화번호]"
    )
    .replace(
      /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
      "[이메일]"
    )
    .replace(
      /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
      "[개인정보]"
    )
    .replace(
      /https?:\/\/\S+/gi,
      "[링크]"
    );
}

function selectedFields(source, fields, studentName) {
  return Object.fromEntries(
    fields
      .map((key) => [
        key,
        clean(source?.[key], studentName)
      ])
      .filter(([, value]) => Boolean(value))
  );
}

const PERSONAL_FIELDS = [
  "word",
  "grammar",
  "retest",
  "homeworkStatus",
  "individualNotice",
  "individualHomework",
  "memo"
];

const CLASS_FIELDS = [
  "previous",
  "notice",
  "todayClass",
  "homework",
  "online"
];

async function getLiveIndividualRecord(
  name,
  level,
  allowedDates
) {
  if (!process.env.NOTION_EXAM_ALERTS_DB_ID) {
    return null;
  }

  try {
    const pages = await notionQuery(
      process.env.NOTION_EXAM_ALERTS_DB_ID
    );

    const matches = pages
      .map((page) => ({
        ...getAlertFromPage(page),
        lastEdited: page.last_edited_time || ""
      }))
      .filter(
        (alert) =>
          alert.public !== false &&
          compact(alert.studentName) ===
            compact(name) &&
          normalizeLevel(alert.level) === level &&
          allowedDates.has(
            String(alert.date || "").slice(0, 10)
          )
      )
      .sort((a, b) =>
        String(b.lastEdited).localeCompare(
          String(a.lastEdited)
        )
      );

    const alert = matches[0];

    if (!alert) return null;

    const fields = selectedFields(
      alert,
      PERSONAL_FIELDS,
      name
    );

    if (!Object.keys(fields).length) {
      return null;
    }

    return {
      date: String(alert.date).slice(0, 10),
      ...fields
    };
  } catch (error) {
    console.error(
      "Failed to load latest individual alert:",
      error?.name || "Error"
    );
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request
      .json()
      .catch(() => null);

    if (!body || !isAdmin(body)) {
      return Response.json(
        {
          error: "관리자 인증에 실패했습니다."
        },
        { status: 401 }
      );
    }

    const name = String(
      body.studentName ?? ""
    ).trim();

    const level = normalizeLevel(body.level);

    const targetDate = String(
      body.targetDate || todayKst()
    ).slice(0, 10);

    if (
      !name ||
      !level ||
      !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ) {
      return Response.json(
        {
          error:
            "학생 또는 날짜 정보가 올바르지 않습니다."
        },
        { status: 400 }
      );
    }

    const pages = await notionQuery(
      process.env.NOTION_STUDENTS_DB_ID
    );

    const matches = pages
      .map((page) => ({
        ...getStudentFromPage(page),
        pageId: page.id
      }))
      .filter(
        (student) =>
          student.pageId &&
          isActiveStudent(student.status) &&
          compact(student.name) === compact(name) &&
          normalizeLevel(student.level) === level
      );

    if (matches.length !== 1) {
      return Response.json(
        {
          error:
            "학생을 정확히 확인할 수 없습니다. 학생명과 반을 확인해 주세요."
        },
        { status: 404 }
      );
    }

    const student = matches[0];
    const allowedDates = new Set(
      recentDates(targetDate, DAYS)
    );

    const [
      personalHistory,
      homeworkHistory,
      liveRecord
    ] = await Promise.all([
      getIndividualHistory(
        student.pageId,
        targetDate
      ),
      getHomeworkHistory(
        student.level,
        targetDate
      ),
      getLiveIndividualRecord(
        name,
        level,
        allowedDates
      )
    ]);

    const personalByDate = new Map();

    for (const item of personalHistory) {
      if (!allowedDates.has(item.date)) continue;

      const fields = selectedFields(
        item.alert,
        PERSONAL_FIELDS,
        name
      );

      if (Object.keys(fields).length) {
        personalByDate.set(item.date, {
          date: item.date,
          ...fields
        });
      }
    }

    if (
      liveRecord &&
      !personalByDate.has(liveRecord.date)
    ) {
      personalByDate.set(
        liveRecord.date,
        liveRecord
      );
    }

    const personalRecords = [
      ...personalByDate.values()
    ].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const classRecords = homeworkHistory
      .filter((item) =>
        allowedDates.has(item.date)
      )
      .map((item) => ({
        date: item.date,
        ...selectedFields(
          item.homework,
          CLASS_FIELDS,
          name
        )
      }))
      .filter(
        (item) => Object.keys(item).length > 1
      )
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );

    if (
      !personalRecords.length &&
      !classRecords.length
    ) {
      return Response.json(
        {
          error:
            "최근 7일간 저장된 반별 숙제나 개인 학습 기록이 없습니다."
        },
        { status: 404 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        {
          error:
            "Vercel에 OPENAI_API_KEY가 등록되지 않았습니다."
        },
        { status: 503 }
      );
    }

    const limitKey =
      `childu:weekly-ai:limit:${todayKst()}`;

    const used = await kv.incr(limitKey);

    if (used === 1) {
      await kv.expire(
        limitKey,
        60 * 60 * 24
      );
    }

    if (used > MAX_CALLS_PER_DAY) {
      return Response.json(
        {
          error:
            "오늘 AI 주간 요약 생성 한도에 도달했습니다."
        },
        { status: 429 }
      );
    }

    const instructions = [
      "당신은 영어학원 학부모용 주간 학습 안내문을 작성하는 도우미입니다.",
      "반드시 한국어로 작성하세요.",
      "출력은 카카오톡에 바로 보낼 수 있는 형식으로 작성하세요.",
      "반드시 아래 구조를 지키세요.",
      "",
      "[ChiidU 모스트영어학원 주간 학습 안내]",
      "",
      "안녕하세요. [학생이름] 학생의 [기간] 학습 결과를 안내드립니다.",
      "",
      "📊 시험 결과",
      "- 단어: ...",
      "- 듣기: ...",
      "- 독해: ...",
      "- 문법: ...",
      "",
      "📘 학습 내용",
      "- 문법: ...",
      "- 독해: ...",
      "- 기타: ...",
      "",
      "📌 확인 사항",
      "- 재시험 여부: ...",
      "- 숙제 여부: ...",
      "- 출결: ...",
      "- 기타 전달사항: ...",
      "",
      "가정에서는 ... 부탁드립니다.",
      "",
      "중요 규칙:",
      "1. classRecords는 반 전체 공통 수업/숙제 기록입니다.",
      "2. personalRecords는 해당 학생 개인 기록입니다.",
      "3. 반 공통 기록만으로 숙제 미이행, 결석, 지각을 추측하지 마세요.",
      "4. 숙제 여부, 지각, 결석은 personalRecords 또는 개인 기록에 명확히 있는 경우에만 쓰세요.",
      "5. 개인 기록에 결석이 없다면 모두 출석하였습니다라고 쓰세요.",
      "6. 시험 점수는 날짜와 함께 정확히 반영하세요.",
      "7. 단어/듣기/독해/문법 구분이 불명확하면 추측하지 마세요.",
      "8. 재시험 정보가 있으면 확인 사항에 넣으세요.",
      "9. 개인 안내나 숙제 상태가 있으면 확인 사항에 넣으세요.",
      "10. 문장은 읽기 쉽게 짧게 나누고, 줄바꿈을 충분히 넣으세요.",
      "11. 제목, 이모티콘, 소제목 형식을 유지하세요.",
      "12. 학생을 비난하지 말고 정중하고 따뜻한 말투를 사용하세요.",
      "13. 코드블록, JSON, 번호 목록 대신 실제 안내문만 출력하세요."
    ].join("\n");

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      25000
    );

    let apiResponse;

    try {
      apiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model:
              process.env.OPENAI_MODEL ||
              "gpt-5.4-mini",
            store: false,
            max_output_tokens: 1200,
            instructions,
            input: JSON.stringify({
              academyName: "ChiidU 모스트영어학원",
              studentName: name,
              level: student.level,
              periodStart: recentDates(
                targetDate,
                DAYS
              ).at(-1),
              periodEnd: targetDate,
              classRecords,
              personalRecords
            })
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!apiResponse.ok) {
      console.error(
        "OpenAI response status:",
        apiResponse.status
      );

      const message =
        apiResponse.status === 401
          ? "OpenAI API 키를 확인해 주세요."
          : apiResponse.status === 429
          ? "OpenAI API 사용 한도 또는 결제 설정을 확인해 주세요."
          : apiResponse.status === 400
          ? "OpenAI 모델 또는 요청 형식을 확인해 주세요."
          : "AI 주간 요약을 생성하지 못했습니다.";

      return Response.json(
        { error: message },
        { status: 502 }
      );
    }

    const result = await apiResponse.json();

    const generated = (result.output || [])
      .filter(
        (item) => item.type === "message"
      )
      .flatMap(
        (item) => item.content || []
      )
      .filter(
        (item) => item.type === "output_text"
      )
      .map(
        (item) => item.text || ""
      )
      .join("\n")
      .trim();

    if (
      !generated ||
      result.status === "incomplete"
    ) {
      return Response.json(
        {
          error:
            "AI 요약 결과가 완성되지 않았습니다. 다시 시도해 주세요."
        },
        { status: 502 }
      );
    }

    return Response.json(
      {
        text: generated,
        classRecordCount:
          classRecords.length,
        personalRecordCount:
          personalRecords.length
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error(
      "Weekly summary request failed:",
      error?.name || "Error"
    );

    return Response.json(
      {
        error:
          "주간 요약 처리 중 서버 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}
