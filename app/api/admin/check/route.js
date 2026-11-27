"use client";

import { useMemo, useState } from "react";

function todayIsoKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

function formatCheckedTime(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function AdminCheckPage() {
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");

  const [date, setDate] = useState(todayIsoKst());

  const [data, setData] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState("전체");

  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weeklyLoadingKey, setWeeklyLoadingKey] = useState("");
  const [weeklyResult, setWeeklyResult] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");

  const levels = useMemo(() => {
    if (!data?.students?.length) return [];

    return Array.from(
      new Set(
        data.students
          .map((student) => student.level)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      String(a).localeCompare(String(b), "ko")
    );
  }, [data]);

  const visibleStudents = useMemo(() => {
    if (!data?.students?.length) return [];

    let students = [...data.students];

    if (selectedLevel !== "전체") {
      students = students.filter(
        (student) => student.level === selectedLevel
      );
    }

    if (onlyUnchecked) {
      students = students.filter(
        (student) => !student.checked
      );
    }

    return students.sort((a, b) => {
      const levelCompare = String(a.level).localeCompare(
        String(b.level),
        "ko"
      );

      if (levelCompare !== 0) {
        return levelCompare;
      }

      return String(a.name).localeCompare(
        String(b.name),
        "ko"
      );
    });
  }, [data, selectedLevel, onlyUnchecked]);

  const visibleSummary = useMemo(() => {
    if (!data?.students?.length) {
      return {
        total: 0,
        checked: 0,
        unchecked: 0
      };
    }

    const students =
      selectedLevel === "전체"
        ? data.students
        : data.students.filter(
            (student) =>
              student.level === selectedLevel
          );

    const checked = students.filter(
      (student) => student.checked
    ).length;

    return {
      total: students.length,
      checked,
      unchecked: students.length - checked
    };
  }, [data, selectedLevel]);

  async function loadStatus(event) {
    if (event) {
      event.preventDefault();
    }

    const cleanName = adminName.trim();
    const cleanPin = adminPin.trim();

    if (!cleanName) {
      setError("관리자 이름을 입력해 주세요.");
      return;
    }

    if (!cleanPin) {
      setError("관리자 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/admin/check",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            adminName: cleanName,
            adminPin: cleanPin,
            date
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(
          result?.error ||
            "확인 현황을 불러오지 못했습니다."
        );
        return;
      }

      setData(result);

      if (
        selectedLevel !== "전체" &&
        !result.students?.some(
          (student) =>
            student.level === selectedLevel
        )
      ) {
        setSelectedLevel("전체");
      }
    } catch (error) {
      setError(
        "확인 현황을 불러오는 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setData(null);
    setAdminName("");
    setAdminPin("");
    setSelectedLevel("전체");
    setOnlyUnchecked(false);
    setError("");
    setWeeklyResult(null);
    setCopyMessage("");
  }

  async function generateWeeklySummary(student) {
    const key = `${student.level}::${student.name}`;
    setWeeklyLoadingKey(key);
    setWeeklyResult(null);
    setCopyMessage("");
    try {
      const response = await fetch("/api/admin/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: adminName.trim(), adminPin,
          studentName: student.name, level: student.level, targetDate: date
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI 요약 생성 오류");
      const generatedText = String(result.text || result.message || "").trim();
      if (!generatedText) throw new Error("요약 내용이 비어 있습니다. API 응답을 확인해 주세요.");
      setWeeklyResult({ key, name: student.name, text: generatedText });
      try {
        await navigator.clipboard.writeText(generatedText);
        setCopyMessage("요약문 복사를 요청했습니다. 카카오톡에 붙여넣기 전에 내용을 확인해 주세요.");
      } catch (_) {
        setCopyMessage("브라우저에서 자동 복사를 허용하지 않았습니다. 아래 '복사하기' 버튼을 눌러 주세요.");
      }
    } catch (error) {
      setWeeklyResult({ key, name: student.name, text: "" });
      setCopyMessage(error.message || "요약 생성 실패");
    } finally {
      setWeeklyLoadingKey("");
    }
  }

  async function copyWeeklySummary() {
    if (!weeklyResult?.text) return;
    try {
      await navigator.clipboard.writeText(weeklyResult.text);
      setCopyMessage("복사를 요청했습니다. 발송 전 학습 정보가 정확한지 확인해 주세요.");
    } catch (_) {
      setCopyMessage("복사에 실패했습니다. 문장을 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-wrap">
        <header className="admin-header">
          <div>
            <div className="admin-brand">
              CHILDU MOST ENGLISH
            </div>

            <h1>숙제 안내 확인 현황</h1>

            <p>
              학부모님의 숙제 안내장 확인 여부를
              날짜별·반별로 확인할 수 있습니다.
            </p>
          </div>

          {data && (
            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              로그아웃
            </button>
          )}
        </header>

        {!data ? (
          <form
            className="login-card"
            onSubmit={loadStatus}
          >
            <div className="card-title">
              🔐 관리자 확인
            </div>

            <label>
              <span>관리자 이름</span>

              <input
                type="text"
                value={adminName}
                onChange={(event) =>
                  setAdminName(event.target.value)
                }
                placeholder="관리자 이름"
                autoComplete="username"
              />
            </label>

            <label>
              <span>관리자 비밀번호</span>

              <input
                type="password"
                value={adminPin}
                onChange={(event) =>
                  setAdminPin(event.target.value)
                }
                placeholder="관리자 비밀번호"
                autoComplete="current-password"
              />
            </label>

            <label>
              <span><span className="admin-date-emoji" aria-hidden="true">🗓️</span> 조회 날짜</span>

              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
              />
            </label>

            {error && (
              <div className="error-box">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading
                ? "불러오는 중..."
                : "확인 현황 보기"}
            </button>
          </form>
        ) : (
          <>
            <section className="control-card">
              <div className="date-area">
                <label>
                  <span><span className="admin-date-emoji" aria-hidden="true">🗓️</span> 조회 날짜</span>

                  <input
                    type="date"
                    value={date}
                    onChange={(event) =>
                      setDate(event.target.value)
                    }
                  />
                </label>

                <button
                  type="button"
                  className="search-button"
                  onClick={loadStatus}
                  disabled={loading}
                >
                  {loading
                    ? "조회 중..."
                    : "날짜 조회"}
                </button>
              </div>

              <div className="current-date">
                {formatDate(data.date)} 확인 현황
              </div>

              {error && (
                <div className="error-box">
                  {error}
                </div>
              )}
            </section>

            <section className="summary-grid">
              <div className="summary-card">
                <span>전체</span>
                <strong>
                  {visibleSummary.total}
                  <small>명</small>
                </strong>
              </div>

              <div className="summary-card checked-summary">
                <span>확인</span>
                <strong>
                  {visibleSummary.checked}
                  <small>명</small>
                </strong>
              </div>

              <div className="summary-card unchecked-summary">
                <img
                  className="admin-unchecked-metric"
                  src="/childu-unchecked-3d.webp"
                  alt=""
                  aria-hidden="true"
                  width="27"
                  height="27"
                />
                <span>미확인</span>
                <strong>
                  {visibleSummary.unchecked}
                  <small>명</small>
                </strong>
              </div>
            </section>

            <section className="filter-card">
              <div className="filter-title">
                반 선택
              </div>

              <div className="level-buttons">
                <button
                  type="button"
                  className={
                    selectedLevel === "전체"
                      ? "level-button active"
                      : "level-button"
                  }
                  onClick={() =>
                    setSelectedLevel("전체")
                  }
                >
                  전체
                </button>

                {levels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={
                      selectedLevel === level
                        ? "level-button active"
                        : "level-button"
                    }
                    onClick={() =>
                      setSelectedLevel(level)
                    }
                  >
                    {level}
                  </button>
                ))}
              </div>

              <label className="unchecked-toggle">
                <input
                  type="checkbox"
                  checked={onlyUnchecked}
                  onChange={(event) =>
                    setOnlyUnchecked(
                      event.target.checked
                    )
                  }
                />

                <span>미확인 학생만 보기</span>
              </label>
            </section>

            <section className="student-card">
              <div className="student-card-head">
                <div>
                  <div className="student-title">
                    <img
                      className="admin-student-illustration"
                      src="/childu-student-3d.webp"
                      alt=""
                      aria-hidden="true"
                      width="29"
                      height="29"
                    />
                    {selectedLevel === "전체"
                      ? "전체 재원생"
                      : selectedLevel}
                  </div>

                  <div className="student-subtitle">
                    {onlyUnchecked
                      ? "아직 숙제 안내장을 확인하지 않은 학생입니다."
                      : "학부모님의 숙제 안내장 확인 여부입니다."}
                  </div>
                </div>

                <div className="result-count">
                  {visibleStudents.length}명
                </div>
              </div>

              {visibleStudents.length === 0 ? (
                <div className="empty-box">
                  {onlyUnchecked
                    ? "🎉 미확인 학생이 없습니다."
                    : "해당 조건의 학생이 없습니다."}
                </div>
              ) : (
                <div className="student-list">
                  {visibleStudents.map(
                    (student) => (
                      <div
                        key={`${student.level}-${student.name}`}
                        className={
                          student.checked
                            ? "student-row checked-row"
                            : "student-row unchecked-row"
                        }
                      >
                        <div className="status-icon">
                          {student.checked ? (
                            <span className="admin-checked-mark" aria-label="확인 완료">✓</span>
                          ) : (
                            <img
                              className="admin-status-illustration"
                              src="/childu-unchecked-3d.webp"
                              alt="미확인"
                              width="27"
                              height="27"
                            />
                          )}
                        </div>

                        <div className="student-info">
                          <div className="student-name">
                            {student.name}
                          </div>

                          <div className="student-level">
                            {student.level}
                            {student.grade
                              ? ` · ${student.grade}`
                              : ""}
                          </div>
                          <button type="button" className="weekly-button"
                            disabled={Boolean(weeklyLoadingKey)}
                            onClick={() => generateWeeklySummary(student)}>
                            {weeklyLoadingKey === `${student.level}::${student.name}` ? "생성 중..." : "주간 요약 · 복사"}
                          </button>
                        </div>

                        <div className="check-info">
                          {student.checked ? (
                            <>
                              <strong>
                                확인 완료
                              </strong>

                              <span>
                                {formatCheckedTime(
                                  student.checkedAt
                                )}{" "}
                                확인
                              </span>

                              {student.homeworkDate && (
                                <small>
                                  숙제 날짜{" "}
                                  {student.homeworkDate}
                                </small>
                              )}
                            </>
                          ) : (
                            <>
                              <strong className="not-checked-text">
                                미확인
                              </strong>

                              <span>
                                아직 확인하지
                                않았습니다.
                              </span>
                            </>
                          )}
                        </div>
                        {weeklyResult?.key === `${student.level}::${student.name}` && (
                          <div className="weekly-output">
                            <strong>{weeklyResult.name} 학생 · 주간 학습 요약</strong>
                            <p className="weekly-warning">AI가 잘못 해석한 표현이 없는지 검토하고, 필요한 부분을 고친 뒤 카카오톡에 발송하세요.</p>
                            {weeklyResult.text && (
                              <>
                                <textarea aria-label="주간 요약 수정" value={weeklyResult.text}
                                  onChange={(event) => setWeeklyResult((prev) => ({ ...prev, text: event.target.value }))}
                                  rows={13} />
                                <button type="button" onClick={copyWeeklySummary} className="copy-weekly-button">수정한 문구 복사하기</button>
                              </>
                            )}
                            {copyMessage && <p className="copy-feedback">{copyMessage}</p>}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            <div className="admin-note">
              ※ 확인 기록은 학부모님이 학생 이름과
              보호자 확인번호를 정확히 입력하여 숙제
              안내장을 정상적으로 열었을 때 기록됩니다.
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .admin-page {
          min-height: 100vh;
          background: #f5f7fb;
          color: #1f2937;
          padding: 24px 14px 60px;
        }

        .admin-wrap {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        }

        .admin-brand {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 1.3px;
          color: #6b7280;
          margin-bottom: 6px;
        }

        .admin-header h1 {
          margin: 0;
          font-size: 26px;
          line-height: 1.3;
        }

        .admin-header p {
          margin: 8px 0 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.6;
        }

        .login-card,
        .control-card,
        .filter-card,
        .student-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          padding: 20px;
          box-shadow: 0 8px 28px
            rgba(15, 23, 42, 0.05);
        }

        .login-card {
          display: grid;
          gap: 16px;
        }

        .card-title {
          font-size: 18px;
          font-weight: 900;
        }

        label {
          display: grid;
          gap: 7px;
        }

        label > span {
          font-size: 13px;
          font-weight: 800;
          color: #4b5563;
        }

        input[type="text"],
        input[type="password"],
        input[type="date"] {
          width: 100%;
          min-height: 50px;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          padding: 0 14px;
          font-size: 16px;
          background: #f9fafb;
          color: #111827;
          outline: none;
        }

        input:focus {
          border-color: #2563eb;
          background: white;
        }

        .login-button,
        .search-button {
          border: 0;
          border-radius: 14px;
          background: #111827;
          color: white;
          font-size: 15px;
          font-weight: 900;
          min-height: 52px;
          padding: 0 18px;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .logout-button {
          flex: 0 0 auto;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 999px;
          padding: 9px 13px;
          font-weight: 800;
          color: #4b5563;
          cursor: pointer;
        }

        .error-box {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 700;
        }

        .control-card {
          margin-bottom: 14px;
        }

        .date-area {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: end;
        }

        .search-button {
          min-width: 110px;
        }

        .current-date {
          margin-top: 16px;
          padding-top: 15px;
          border-top: 1px solid #f0f1f3;
          font-size: 16px;
          font-weight: 900;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }

        .summary-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          padding: 16px 10px;
          text-align: center;
        }

        .summary-card span {
          display: block;
          font-size: 12px;
          font-weight: 800;
          color: #6b7280;
          margin-bottom: 6px;
        }

        .summary-card strong {
          font-size: 24px;
          color: #111827;
        }

        .summary-card small {
          margin-left: 2px;
          font-size: 12px;
        }

        .checked-summary {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .checked-summary strong {
          color: #15803d;
        }

        .unchecked-summary {
          background: #fff1f2;
          border-color: #fecdd3;
        }

        .unchecked-summary strong {
          color: #e11d48;
        }

        .filter-card {
          margin-bottom: 14px;
        }

        .filter-title {
          font-size: 15px;
          font-weight: 900;
          margin-bottom: 11px;
        }

        .level-buttons {
          display: flex;
          gap: 7px;
          overflow-x: auto;
          padding-bottom: 7px;
        }

        .level-button {
          flex: 0 0 auto;
          border: 1px solid #d1d5db;
          background: white;
          color: #4b5563;
          border-radius: 999px;
          padding: 9px 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .level-button.active {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }

        .unchecked-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          cursor: pointer;
        }

        .unchecked-toggle input {
          width: 18px;
          height: 18px;
        }

        .unchecked-toggle span {
          font-size: 14px;
          color: #374151;
        }

        .student-card {
          padding: 0;
          overflow: hidden;
        }

        .student-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 20px;
          border-bottom: 1px solid #eef0f3;
        }

        .student-title {
          font-size: 18px;
          font-weight: 900;
        }

        .student-subtitle {
          margin-top: 5px;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.5;
        }

        .result-count {
          flex: 0 0 auto;
          background: #f3f4f6;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 13px;
          font-weight: 900;
        }

        .student-list {
          display: grid;
        }

        .student-row {
          display: grid;
          grid-template-columns: 34px 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 16px 18px;
          border-bottom: 1px solid #f1f2f4;
        }

        .student-row:last-child {
          border-bottom: 0;
        }

        .checked-row {
          background: #ffffff;
        }

        .unchecked-row {
          background: #fffafa;
        }

        .status-icon {
          font-size: 20px;
        }

        .student-name {
          font-size: 16px;
          font-weight: 900;
        }

        .student-level {
          margin-top: 3px;
          font-size: 12px;
          color: #6b7280;
        }

        .check-info {
          text-align: right;
          display: grid;
          gap: 2px;
        }

        .check-info strong {
          font-size: 13px;
          color: #15803d;
        }

        .check-info span {
          font-size: 12px;
          color: #6b7280;
        }

        .check-info small {
          font-size: 10px;
          color: #9ca3af;
        }

        .check-info .not-checked-text {
          color: #e11d48;
        }

        .empty-box {
          padding: 38px 20px;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
          font-weight: 700;
        }

        .admin-note {
          margin: 15px 6px 0;
          color: #9ca3af;
          font-size: 11px;
          line-height: 1.6;
        }

        .snapshot-panel {
          margin-top: 16px;
          padding: 14px;
          background: #f4f0ff;
          border: 1px solid #ddd6fe;
          border-radius: 16px;
          display: grid;
          gap: 10px;
        }
        .snapshot-panel strong { font-size: 15px; }
        .snapshot-panel p { margin: 5px 0 0; color: #6b7280; font-size: 12px; line-height: 1.6; }
        .snapshot-button, .copy-weekly-button {
          border: 0;
          border-radius: 12px;
          padding: 11px 14px;
          background: #5b50d7;
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
        }
        .snapshot-message { color: #4338ca; font-size: 12px; font-weight: 800; }
        .weekly-button {
          margin-top: 9px;
          padding: 6px 8px;
          background: #f0f4ff;
          color: #4338ca;
          border: 1px solid #c7d2fe;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
        }
        .weekly-output { grid-column: 1 / -1; width: 100%; border-top: 1px solid #e5e7eb; padding: 14px 0 2px; }
        .weekly-output strong { display: block; font-size: 14px; }
        .weekly-output textarea { display: block; width: 100%; resize: vertical; border: 1px solid #d1d5db; padding: 12px; border-radius: 12px; color: #111827; background: #fff; font: inherit; line-height: 1.6; }
        .weekly-warning { font-size: 12px; color: #6b7280; line-height: 1.5; }
        .copy-feedback { color: #4338ca; font-size: 12px; font-weight: 700; }
        .copy-weekly-button { margin-top: 9px; }

        @media (max-width: 520px) {
          .admin-page {
            padding: 18px 12px 50px;
          }

          .admin-header h1 {
            font-size: 22px;
          }

          .admin-header p {
            font-size: 13px;
          }

          .date-area {
            grid-template-columns: 1fr;
          }

          .search-button {
            width: 100%;
          }

          .student-row {
            grid-template-columns: 28px 1fr auto;
            padding: 15px 14px;
            gap: 8px;
          }

          .student-name {
            font-size: 15px;
          }

          .check-info span {
            font-size: 11px;
          }

          .summary-card {
            padding: 14px 6px;
          }

          .summary-card strong {
            font-size: 21px;
          }
        }
      `}</style>

      {/* 관리자 화면 전용 스타일: 숙제 사이트의 globals.css는 변경하지 않습니다. */}
      <style jsx global>{`
        .admin-page .admin-date-emoji {
          display: inline-block !important;
          font-size: 14px !important;
          line-height: 1 !important;
          vertical-align: -1px !important;
          margin-right: 5px !important;
          color: inherit;
        }
        .admin-page .current-date {
          gap: 0 !important;
          padding-top: 15px !important;
        }
        .admin-page .current-date::before {
          content: none !important;
          display: none !important;
          background-image: none !important;
        }
        .admin-page .current-date::first-letter {
          font-size: inherit !important;
        }
        .admin-page .student-title {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
        }
        .admin-page .student-title::before {
          content: none !important;
          display: none !important;
        }
        .admin-page .admin-student-illustration {
          display: inline-block;
          width: 29px !important;
          height: 29px !important;
          flex: 0 0 auto;
          object-fit: contain;
        }
        .admin-page .unchecked-summary {
          position: relative !important;
        }
        .admin-page .unchecked-summary::before {
          content: none !important;
          display: none !important;
        }
        .admin-page .admin-unchecked-metric {
          display: block;
          position: absolute;
          top: 11px;
          right: 11px;
          width: 27px !important;
          height: 27px !important;
          object-fit: contain;
          opacity: .93;
        }
        .admin-page .student-row .status-icon {
          width: 34px !important;
          height: 34px !important;
          display: grid !important;
          place-items: center !important;
          background: #f7f9f9 !important;
          border: none !important;
          border-radius: 11px !important;
          font-size: 0 !important;
          line-height: 1 !important;
        }
        .admin-page .student-row .status-icon::before {
          content: none !important;
          display: none !important;
          background: none !important;
        }
        .admin-page .student-row .admin-status-illustration {
          width: 27px !important;
          height: 27px !important;
          object-fit: contain;
        }
        .admin-page .student-row .admin-checked-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 23px;
          height: 23px;
          border-radius: 100px;
          background: #e7f6ef;
          color: #317a64;
          font-size: 16px !important;
          font-weight: 850;
        }
        .admin-page .weekly-output > strong::first-letter {
          font-size: inherit !important;
        }
        .admin-page .snapshot-panel { display: none !important; }
        @media (max-width: 620px) {
          .admin-page .admin-student-illustration {
            width: 26px !important;
            height: 26px !important;
          }
          .admin-page .admin-unchecked-metric {
            width: 23px !important;
            height: 23px !important;
            right: 7px;
            top: 9px;
          }
        }
      `}</style>
    </div>
  );
}
