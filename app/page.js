"use client";

import { useMemo, useState } from "react";

function todayText() {
  return new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function formatDateLabel(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  });
}

function todayIsoKst(offset = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  kst.setUTCDate(kst.getUTCDate() + offset);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateButtonLabel(dateString) {
  if (dateString === todayIsoKst(0)) return "오늘";
  if (dateString === todayIsoKst(-1)) return "어제";

  return formatDateLabel(dateString);
}

function CuteIcon({ name, small = false }) {
  return (
    <span
      aria-hidden="true"
      className={`cute-icon cute-icon--${name}${small ? " cute-icon--small" : ""}`}
    />
  );
}

function SectionCard({ icon, tone, title, children }) {
  return (
    <div className="info-card">
      <div className="info-title">
        <div className={`info-icon ${tone}`}><CuteIcon name={icon} /></div>
        <h3>{title}</h3>
      </div>
      <div className="info-body">{children}</div>
    </div>
  );
}

export default function Page() {
  const [studentName, setStudentName] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState(null);
  const [individualHistory, setIndividualHistory] = useState([]);
  const [individualHistoryLoading, setIndividualHistoryLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedHomework = useMemo(() => {
    if (!notice) return null;

    if (notice.homeworkHistory?.length) {
      return notice.homeworkHistory.find((item) => item.date === selectedDate) || null;
    }

    if (notice.homework && selectedDate === notice.date) {
      return {
        date: notice.date,
        homework: notice.homework
      };
    }

    return null;
  }, [notice, selectedDate]);

  // 날짜 선택은 반별 숙제와 학생별 개인 기록에 공통 적용합니다.
  const sortedHistory = useMemo(() => {
    const dates = new Set([
      ...(notice?.homeworkHistory || []).map((item) => item.date),
      ...individualHistory.map((item) => item.date)
    ].filter(Boolean));
    return [...dates].sort().map((date) => ({ date }));
  }, [notice, individualHistory]);

  const selectedIndividual = useMemo(() => {
    const saved = individualHistory.find((item) => item.date === selectedDate);
    if (saved) return saved.alert;
    // 아직 저장하지 않은 최신 안내는 기존 화면을 유지하되,
    // 과거 날짜에 현재 안내를 잘못 붙여 표시하지는 않습니다.
    if (notice?.alert && selectedDate === notice.date) return notice.alert;
    return null;
  }, [individualHistory, notice, selectedDate]);

  async function loadIndividualHistory(studentName, pin) {
    try {
      setIndividualHistoryLoading(true);
      const response = await fetch("/api/individual-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, pin })
      });
      if (response.ok) {
        const result = await response.json();
        setIndividualHistory(result.history || []);
      }
    } catch (_) {
      // 이전 기록 조회가 실패해도 현재 숙제 안내장 열람은 유지합니다.
    } finally {
      setIndividualHistoryLoading(false);
    }
  }

  async function submitNotice(event) {
    event.preventDefault();

    const cleanName = studentName.trim();
    const cleanPin = pin.trim();

    if (!cleanName) {
      setError("학생 이름을 입력해 주세요.");
      return;
    }

    if (cleanPin.length < 4) {
      setError("보호자 확인번호 4자리를 입력해 주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/notice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          studentName: cleanName,
          pin: cleanPin
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "안내장을 불러오지 못했습니다.");
        return;
      }

      setNotice(data);
      setIndividualHistory([]);
      void loadIndividualHistory(cleanName, cleanPin);

      if (data.homeworkHistory?.length) {
        setSelectedDate(data.homeworkHistory[0].date);
      } else {
        setSelectedDate(data.date || "");
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError("안내장을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function resetToHome() {
    setNotice(null);
    setIndividualHistory([]);
    setIndividualHistoryLoading(false);
    setStudentName("");
    setPin("");
    setSelectedDate("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app">
      <header className="top">
        <button
          className="back"
          style={{ display: notice ? "block" : "none" }}
          onClick={resetToHome}
        >
          ‹
        </button>

        <div className="logo" aria-label="ChiidU">C</div>

        <div>
          <div className="brand-small">CHILDU MOST ENGLISH</div>
          <div className="brand-title">차일드유 숙제 안내장</div>
        </div>
      </header>

      <main>
        {!notice && (
          <section>
            <div className="hero">
              <div className="badge"><CuteIcon name="star" small /> 오늘의 학습 안내</div>
              <h1>우리 아이의 오늘 학습 안내를 정리해두었습니다.</h1>
              <p>
                숙제 안내장은 수업 후 순차적으로 업데이트됩니다.
                학생 이름과 보호자 확인번호를 입력해 오늘의 학습 내용을 확인해 주세요.
              </p>
              <div className="date-pill">
                <CuteIcon name="calendar" small /> <span>{todayText()}</span>
              </div>
            </div>

            <div className="note-box">
              <CuteIcon name="chat" small />
              <span>학생 이름과 보호자 확인번호를 정확히 입력해 주세요.</span>
            </div>

            <form onSubmit={submitNotice} className="panel">
              <div className="panel-head"><CuteIcon name="lock" small /> 학생 정보 확인</div>

              <div style={{ display: "grid", gap: "14px" }}>
                <label style={{ display: "grid", gap: "7px" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      color: "#6b7280"
                    }}
                  >
                    학생 이름
                  </span>
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="예: ㅇㅇㅇ"
                    autoComplete="off"
                    style={{
                      width: "100%",
                      height: "54px",
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      borderRadius: "19px",
                      padding: "0 16px",
                      fontSize: "17px",
                      fontWeight: 800,
                      outline: "none"
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: "7px" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      color: "#6b7280"
                    }}
                  >
                    보호자 확인번호
                  </span>
                  <input
                    className="pin-input"
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="뒤 4자리"
                    autoComplete="off"
                  />
                </label>
              </div>

              {error && (
                <div className="error-box" style={{ marginTop: "14px" }}>
                  {error}
                </div>
              )}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "확인 중..." : "안내장 확인하기"}
              </button>
            </form>
          </section>
        )}

        {notice && (
          <section>
            <div className="student-head">
              <div className="small">오늘의 학습 안내</div>
              <h2>{notice.studentName} 숙제 안내장</h2>
              <p>{notice.date || todayText()}</p>
            </div>

            <div className="personal">
              <div className="personal-title">
                <div className="round-icon"><CuteIcon name="chat" /></div>
                <div>
                  <div className="caption">개별 학습 알림</div>
                  <h3>{selectedIndividual ? "선택한 날짜의 개인 안내" : "개별 안내 없음"}</h3>
                </div>
              </div>

              {selectedIndividual ? (
                <div>
                  <div className="score-grid">
                    <div className="score">
                      <div className="k">단어</div>
                      <div className="v">{selectedIndividual.word || "-"}</div>
                    </div>

                    <div className="score">
                      <div className="k">문법/독해</div>
                      <div className="v">{selectedIndividual.grammar || "-"}</div>
                    </div>

                    <div className="score">
                      <div className="k">재시험</div>
                      <div className="v">{selectedIndividual.retest || "-"}</div>
                    </div>
                  </div>

                  {selectedIndividual.homeworkStatus && (
                    <div className="memo">
                      <strong>숙제 확인</strong>
                      <br />
                      {selectedIndividual.homeworkStatus}
                    </div>
                  )}

                  {selectedIndividual.individualNotice && (
                    <div className="memo">
                      <strong>개별 전달사항</strong>
                      <br />
                      {selectedIndividual.individualNotice}
                    </div>
                  )}

                  {selectedIndividual.individualHomework && (
                    <div className="memo">
                      <strong>개별 숙제</strong>
                      <br />
                      {selectedIndividual.individualHomework}
                    </div>
                  )}

                  {selectedIndividual.memo && (
                    <div className="memo">
                      <strong>개별 안내</strong>
                      <br />
                      {selectedIndividual.memo}
                    </div>
                  )}

                  {!selectedIndividual.homeworkStatus &&
                    !selectedIndividual.individualNotice &&
                    !selectedIndividual.individualHomework &&
                    !selectedIndividual.memo && (
                      <div className="memo">개별 안내는 없습니다.</div>
                    )}
                </div>
              ) : (
                <div className="memo">
                  이 날짜에 저장된 개인 기록이 없습니다. 반 공통 숙제도 확인해 주세요.
                </div>
              )}
            </div>

            {sortedHistory.length > 0 && (
              <div className="panel" style={{ marginTop: "16px" }}>
                <div className="panel-head"><CuteIcon name="calendar" small /> 학습 안내 날짜 선택</div>

<div className="history-dates">
                  {sortedHistory.map((item) => {
                    const isToday = item.date === todayIsoKst(0);
                    const isSelected = selectedDate === item.date;

                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => setSelectedDate(item.date)}
                        className={`history-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                      >
                        {dateButtonLabel(item.date)}
                      </button>
                    );
                  })}
                </div>

<div className="history-help">
                  최근 7일 동안 저장된 반별 숙제와 개인 안내를 날짜별로 확인할 수 있습니다.
                  {individualHistoryLoading && " 개인 기록을 불러오는 중입니다..."}
                </div>
              </div>
            )}

            {!selectedHomework?.homework ? (
              <div className="error-box">
                선택한 날짜에 등록된 숙제가 없습니다. 학원에서 순차적으로 업데이트 중입니다.
              </div>
            ) : (
              <div>
                <div className="homework-date-heading">
                  <CuteIcon name="calendar" small />
                  <span>{formatDateLabel(selectedHomework.date)} 숙제 안내</span>
                </div>

                <SectionCard icon="clipboard" tone="blue" title="지난 숙제">
                  {selectedHomework.homework.previous || "-"}
                </SectionCard>

                <SectionCard icon="megaphone" tone="rose" title="전달사항">
                  {selectedHomework.homework.notice || "-"}
                </SectionCard>

                <SectionCard icon="book" tone="yellow" title="오늘의 수업">
                  {selectedHomework.homework.todayClass || "-"}
                </SectionCard>

                <SectionCard icon="notebook" tone="orange" title="오늘의 숙제">
                  {selectedHomework.homework.homework || "-"}
                </SectionCard>

                <SectionCard icon="laptop" tone="green" title="온라인 숙제">
                  {selectedHomework.homework.online || "-"}
                </SectionCard>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
