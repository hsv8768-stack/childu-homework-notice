
"use client";

import { useMemo, useState } from "react";

// 한국 시간 기준 오늘 날짜
function todayIsoKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 날짜 표시
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

// 학부모 확인 시간 표시
function formatCheckedTime(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit"
  });
}

// 학생 구분
function studentKey(student) {
  return `${student.level || ""}::${student.name || ""}`;
}

export default function AdminCheckPage() {
  // 관리자 로그인
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");

  // 확인 현황
  const [date, setDate] = useState(todayIsoKst());
  const [data, setData] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState("전체");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 개인 기록 저장
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState("");

  // AI 주간 요약
  const [summaryBusy, setSummaryBusy] = useState("");
  const [summaryTarget, setSummaryTarget] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");

  // 반 목록
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

  // 화면에 표시할 학생 목록
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

      if (levelCompare !== 0) return levelCompare;

      return String(a.name).localeCompare(
        String(b.name),
        "ko"
      );
    });
  }, [data, selectedLevel, onlyUnchecked]);

  // 확인 현황 집계
  const visibleSummary = useMemo(() => {
    if (!data?.students?.length) {
      return { total: 0, checked: 0, unchecked: 0 };
    }

    const students =
      selectedLevel === "전체"
        ? data.students
        : data.students.filter(
            (student) => student.level === selectedLevel
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

  // 관리자 확인 현황 조회
  async function loadStatus(event) {
    if (event) event.preventDefault();

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

      const response = await fetch("/api/admin/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          adminName: cleanName,
          adminPin: cleanPin,
          date
        })
      });

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
          (student) => student.level === selectedLevel
        )
      ) {
        setSelectedLevel("전체");
      }

    } catch {
      setError("확인 현황을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 로그아웃
  function logout() {
    setData(null);
    setAdminName("");
    setAdminPin("");
    setSelectedLevel("전체");
    setOnlyUnchecked(false);
    setError("");
    setSnapshotMessage("");
    setSummaryTarget("");
    setSummaryText("");
    setSummaryMessage("");
  }

  // ========================================
  // 오늘 개인별 점수 및 메시지 저장
  // ========================================

  async function saveTodaySnapshots() {
    if (snapshotBusy) return;

    setSnapshotBusy(true);
    setSnapshotMessage("");

    try {
      const response = await fetch(
        "/api/admin/individual-snapshot",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            adminName: adminName.trim(),
            adminPin
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "개인 기록 저장에 실패했습니다."
        );
      }

      const saved = Number(result.saved || 0);
      const failed = Number(result.failed || 0);

      if (failed > 0) {
        setSnapshotMessage(
          `⚠️ ${result.date} 일부 저장 실패\n` +
          `저장 성공: ${saved}명\n` +
          `저장 실패: ${failed}명`
        );
      } else if (saved === 0) {
        setSnapshotMessage(
          `⚠️ ${result.date} 저장된 개인 기록이 없습니다.\n` +
          "노션에서 오늘 날짜와 개별 안내 내용을 확인해 주세요."
        );
      } else {
        setSnapshotMessage(
          `✅ ${result.date} 개인 기록 저장 완료!\n` +
          `저장된 학생: ${saved}명\n` +
          `저장 대상 없음 또는 제외: ${result.skipped ?? 0}명`
        );
      }

    } catch (err) {
      setSnapshotMessage(
        `⚠️ ${err.message || "저장 오류가 발생했습니다."}`
      );
    } finally {
      setSnapshotBusy(false);
    }
  }

  // ========================================
  // 학생별 AI 주간 요약 생성
  // ========================================

  async function generateWeeklySummary(student) {
    if (summaryBusy) return;

    const key = studentKey(student);

    setSummaryBusy(key);
    setSummaryTarget(key);
    setSummaryText("");
    setSummaryMessage("✨ AI가 주간 학습 기록을 분석하고 있습니다.");

    try {
      const response = await fetch(
        "/api/admin/weekly-summary",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            adminName: adminName.trim(),
            adminPin,
            studentName: student.name,
            level: student.level,
            targetDate: date
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
          "AI 요약을 불러오지 못했습니다. 서버 설정을 확인해 주세요."
        );
      }

      const message = String(
        result.message || result.text || ""
      ).trim();

      if (!message) {
        throw new Error("생성된 요약 내용이 없습니다.");
      }

      setSummaryText(message);

      // 생성 완료 후 자동 복사 시도
      try {
        await navigator.clipboard.writeText(message);
        setSummaryMessage(
          "✅ 요약 생성 및 복사 완료! 내용을 검토해 주세요."
        );
      } catch {
        setSummaryMessage(
          "✅ 요약 생성 완료! 자동 복사가 제한되어 아래 복사 버튼을 이용해 주세요."
        );
      }

    } catch (err) {
      setSummaryMessage(
        `⚠️ ${err.message || "AI 요약 오류가 발생했습니다."}`
      );
    } finally {
      setSummaryBusy("");
    }
  }

  // 수정된 요약본 다시 복사
  async function copyWeeklySummary() {
    if (!summaryText.trim()) return;

    try {
      await navigator.clipboard.writeText(summaryText);
      setSummaryMessage(
        "✅ 현재 요약 문구를 복사했습니다. 카카오톡에 붙여넣으세요."
      );
    } catch {
      setSummaryMessage(
        "⚠️ 복사에 실패했습니다. 문구를 직접 선택해 복사해 주세요."
      );
    }
  }

  // 요약 닫기
  function closeWeeklySummary() {
    setSummaryTarget("");
    setSummaryText("");
    setSummaryMessage("");
  }

  return (
    <div className="admin-page">
      <div className="admin-wrap">

        {/* 상단 제목 */}
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
          // ==================================
          // 관리자 로그인
          // ==================================
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
              <span>조회 날짜</span>
              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
              />
            </label>

            {error && (
              <div className="error-box">{error}</div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "불러오는 중..." : "확인 현황 보기"}
            </button>
          </form>

        ) : (
          <>
            {/* ============================== */}
            {/* 날짜별 확인 현황 */}
            {/* ============================== */}

            <section className="control-card">
              <div className="date-area">
                <label>
                  <span>조회 날짜</span>
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
                  {loading ? "조회 중..." : "날짜 조회"}
                </button>
              </div>

              <div className="current-date">
                📅 {formatDate(data.date)} 확인 현황
              </div>

              {error && (
                <div className="error-box">{error}</div>
              )}

              {/* 새로운 개인 기록 저장 버튼 */}
              <div className="snapshot-panel">
                <div className="snapshot-title">
                  💾 오늘 개인 학습 기록 저장
                </div>

                <p>
                  노션에서 학생별 시험 점수와 개별 메시지를
                  모두 입력한 후 눌러 주세요.
                </p>

                <button
                  type="button"
                  className="snapshot-button"
                  onClick={saveTodaySnapshots}
                  disabled={snapshotBusy}
                >
                  {snapshotBusy
                    ? "💾 개인 기록 저장 중..."
                    : "💾 오늘 개인 기록 저장"}
                </button>

                <div className="snapshot-help">
                  ※ 조회 날짜와 관계없이 한국 시간 기준
                  오늘 날짜로 저장합니다.
                </div>

                {snapshotMessage && (
                  <div className="snapshot-message">
                    {snapshotMessage}
                  </div>
                )}
              </div>
            </section>

            {/* ============================== */}
            {/* 확인 현황 숫자 */}
            {/* ============================== */}

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
                <span>미확인</span>
                <strong>
                  {visibleSummary.unchecked}
                  <small>명</small>
                </strong>
              </div>
            </section>

            {/* ============================== */}
            {/* 반별 필터 */}
            {/* ============================== */}

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
                    setOnlyUnchecked(event.target.checked)
                  }
                />
                <span>미확인 학생만 보기</span>
              </label>
            </section>

            {/* ============================== */}
            {/* 학생별 확인 현황 */}
            {/* ============================== */}

            <section className="student-card">
              <div className="student-card-head">
                <div>
                  <div className="student-title">
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

                  {visibleStudents.map((student) => {
                    const key = studentKey(student);
                    const isSummaryOpen =
                      summaryTarget === key;

                    return (
                      <div
                        key={key}
                        className={
                          student.checked
                            ? "student-row checked-row"
                            : "student-row unchecked-row"
                        }
                      >
                        <div className="status-icon">
                          {student.checked ? "✅" : "❌"}
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

                          {/* 새로운 AI 요약 버튼 */}
                          <button
                            type="button"
                            className="weekly-button"
                            onClick={() =>
                              generateWeeklySummary(student)
                            }
                            disabled={Boolean(summaryBusy)}
                          >
                            {summaryBusy === key
                              ? "✨ 요약 생성 중..."
                              : "✨ 주간 요약 + 복사"}
                          </button>
                        </div>

                        <div className="check-info">
                          {student.checked ? (
                            <>
                              <strong>확인 완료</strong>
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
                                아직 확인하지 않았습니다.
                              </span>
                            </>
                          )}
                        </div>

                        {/* AI 요약 결과 */}
                        {isSummaryOpen && (
                          <div className="weekly-output">
                            <div className="weekly-output-title">
                              📝 {student.name} 학생 주간 학습 요약
                            </div>

                            <p className="weekly-warning">
                              AI가 작성한 내용을 원본 기록과
                              비교한 뒤 카카오톡에 발송해 주세요.
                            </p>

                            <textarea
                              value={summaryText}
                              onChange={(event) =>
                                setSummaryText(event.target.value)
                              }
                              placeholder={
                                summaryBusy === key
                                  ? "AI가 요약을 생성하고 있습니다..."
                                  : "주간 요약이 여기에 표시됩니다."
                              }
                              rows={12}
                              aria-label="주간 요약 내용 수정"
                            />

                            {summaryMessage && (
                              <div className="weekly-feedback">
                                {summaryMessage}
                              </div>
                            )}

                            <div className="weekly-actions">
                              <button
                                type="button"
                                className="copy-weekly-button"
                                onClick={copyWeeklySummary}
                                disabled={!summaryText.trim()}
                              >
                                📋 수정한 요약 복사
                              </button>

                              <button
                                type="button"
                                className="close-weekly-button"
                                onClick={closeWeeklySummary}
                              >
                                닫기
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="admin-note">
              ※ 확인 기록은 학부모님이 학생 이름과
              보호자 확인번호를 입력하여 숙제 안내장을
              정상적으로 열었을 때 기록됩니다.
              AI 요약은 관리자 전용 기능이며
              카카오톡으로 자동 발송되지 않습니다.
            </div>
          </>
        )}
      </div>

      {/* ============================== */}
      {/* 관리자 화면 디자인 */}
      {/* ============================== */}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .admin-page {
          min-height: 100vh;
          background: #f5f7fb;
          color: #1f2937;
          padding: 24px 14px 60px;
          font-family: Arial, sans-serif;
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
          margin-top: 12px;
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

        /* 개인 기록 저장 영역 */

        .snapshot-panel {
          margin-top: 18px;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 16px;
          padding: 16px;
        }

        .snapshot-title {
          font-weight: 900;
          font-size: 16px;
          color: #312e81;
        }

        .snapshot-panel p {
          font-size: 13px;
          line-height: 1.6;
          color: #4b5563;
        }

        .snapshot-button {
          width: 100%;
          min-height: 48px;
          border: 0;
          border-radius: 12px;
          background: #4338ca;
          color: white;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
        }

        .snapshot-help {
          margin-top: 9px;
          font-size: 11px;
          color: #6b7280;
          line-height: 1.5;
        }

        .snapshot-message {
          margin-top: 12px;
          background: white;
          padding: 12px;
          border-radius: 12px;
          font-size: 13px;
          white-space: pre-line;
          line-height: 1.7;
          font-weight: 700;
        }

        /* 확인 현황 숫자 */

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

        /* 반 선택 */

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

        /* 학생 목록 */

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
          grid-template-columns: 34px minmax(0, 1fr) auto;
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

        /* 학생별 AI 요약 버튼 */

        .weekly-button {
          margin-top: 9px;
          padding: 8px 11px;
          border: 1px solid #c7d2fe;
          border-radius: 10px;
          background: #eef2ff;
          color: #4338ca;
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
          text-align: center;
        }

        /* AI 요약 결과 */

        .weekly-output {
          grid-column: 1 / -1;
          background: #f8faff;
          border: 1px solid #dbe4ff;
          border-radius: 16px;
          padding: 15px;
          margin-top: 5px;
          min-width: 0;
        }

        .weekly-output-title {
          font-size: 15px;
          font-weight: 900;
          color: #312e81;
        }

        .weekly-warning {
          font-size: 12px;
          color: #6b7280;
          line-height: 1.6;
        }

        .weekly-output textarea {
          display: block;
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          background: white;
          color: #1f2937;
          font-size: 14px;
          line-height: 1.7;
          resize: vertical;
          font-family: inherit;
        }

        .weekly-feedback {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-line;
          color: #374151;
        }

        .weekly-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .copy-weekly-button {
          border: 0;
          border-radius: 11px;
          background: #4338ca;
          color: white;
          padding: 12px 15px;
          font-weight: 900;
          cursor: pointer;
        }

        .close-weekly-button {
          border: 1px solid #d1d5db;
          border-radius: 11px;
          background: white;
          color: #374151;
          padding: 12px 15px;
          font-weight: 800;
          cursor: pointer;
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

        /* 모바일 화면 */

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
            grid-template-columns: 28px minmax(0, 1fr) auto;
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

          .weekly-button {
            font-size: 11px;
            padding: 8px;
          }

          .weekly-output {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}
