/* =========================
   전역 상태
========================= */
let currentConfig = null;
let cachedQuestions = {};
let cachedStudents = {};
let cachedResponses = {};

/* =========================
   관리자 로그인
========================= */
document.getElementById("btn-admin-login").addEventListener("click", async () => {
    const pw = document.getElementById("admin-pw").value;
    const error = document.getElementById("admin-login-error");
    error.innerText = "";

    const snap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const realPw = snap.val();

    if (!realPw) {
        error.innerText = "관리자 비밀번호가 설정되지 않았습니다.";
        return;
    }
    if (pw !== realPw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    localStorage.setItem("isAdmin", "true");

    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");

    initAdmin();
});

/* =========================
   관리자 로그아웃
========================= */
function adminLogout() {
    localStorage.removeItem("isAdmin");
    document.getElementById("admin-view").classList.add("hidden");
    document.getElementById("admin-login-view").classList.remove("hidden");
    document.getElementById("admin-pw").value = "";
}

document.getElementById("btn-admin-logout")?.addEventListener("click", adminLogout);

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", () => {
    if (localStorage.getItem("isAdmin") === "true") {
        document.getElementById("admin-login-view").classList.add("hidden");
        document.getElementById("admin-view").classList.remove("hidden");
        initAdmin();
    }
});

/* =========================
   관리자 초기화
========================= */
async function initAdmin() {
    await ensureConfigExists();
    listenConfig();
    listenStudents();
    listenQuestions();
    listenResponses();
    listenGame();
    setupQuestionTypeUI();
}

async function ensureConfigExists() {
    const snap = await db.ref(`${PATH.CONFIG}`).once("value");
    if (!snap.val()) {
        await db.ref(`${PATH.CONFIG}`).set(getInitialConfig());
    }
}

/* =========================
   설정(config) 실시간 감시
========================= */
function listenConfig() {
    db.ref(`${PATH.CONFIG}`).on("value", (snap) => {
        currentConfig = snap.val();
        if (!currentConfig) return;

        updateSettingsInputsFromConfig();
        updateStudentCountInputFromConfig();
        updateSubmitCountLabel();
    });
}

/* =========================
   질문 유형(서술형/객관식)에 따라 선택지 입력란 표시
========================= */
function setupQuestionTypeUI() {
    document.getElementById("new-q-type").addEventListener("change", (e) => {
        document.getElementById("choices-row").style.display =
            e.target.value === QUESTION_TYPE.CHOICE ? "block" : "none";
    });
}

/* =========================
   질문 관리
========================= */
function listenQuestions() {
    db.ref(`${PATH.QUESTIONS}`).on("value", (snap) => {
        cachedQuestions = snap.val() || {};
        renderQuestionsAdminList();
    });
}

function getSortedQuestionList() {
    return Object.keys(cachedQuestions)
        .map(qid => ({ qid, ...cachedQuestions[qid] }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function renderQuestionsAdminList() {
    const container = document.getElementById("questions-admin-list");
    container.innerHTML = "";

    const qList = getSortedQuestionList();
    if (qList.length === 0) {
        container.innerHTML = `<p class="hint-text">등록된 질문이 없습니다.</p>`;
        return;
    }

    qList.forEach((q, idx) => {
        const row = document.createElement("div");
        row.className = "student-row";

        const typeLabel = q.type === QUESTION_TYPE.CHOICE ? "객관식" : "서술형";
        const nameSpan = document.createElement("span");
        nameSpan.innerText = `${idx + 1}. ${q.text} (${typeLabel})`;

        const delBtn = document.createElement("button");
        delBtn.className = "secondary";
        delBtn.style.width = "auto";
        delBtn.style.margin = "0";
        delBtn.style.padding = "4px 10px";
        delBtn.innerText = "삭제";
        delBtn.addEventListener("click", () => deleteQuestion(q.qid));

        row.appendChild(nameSpan);
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}

async function deleteQuestion(qid) {
    const ok = confirm("이 질문을 삭제하시겠습니까?\n이 질문에 대한 기존 응답도 함께 삭제됩니다.");
    if (!ok) return;

    // 이 질문에 대한 학생들의 응답도 함께 제거
    const responsesSnap = await db.ref(`${PATH.RESPONSES}`).once("value");
    const responses = responsesSnap.val() || {};
    const updates = {};
    for (const studentId in responses) {
        if (responses[studentId] && responses[studentId][qid] !== undefined) {
            updates[`${PATH.RESPONSES}/${studentId}/${qid}`] = null;
        }
    }
    updates[`${PATH.QUESTIONS}/${qid}`] = null;

    await db.ref().update(updates);
}

document.getElementById("btn-add-question").addEventListener("click", async () => {
    const type = document.getElementById("new-q-type").value;
    const text = document.getElementById("new-q-text").value.trim();
    const choicesRaw = document.getElementById("new-q-choices").value.trim();
    const status = document.getElementById("question-status");
    status.innerText = "";

    let choices = [];
    if (type === QUESTION_TYPE.CHOICE) {
        choices = choicesRaw.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }

    const error = validateQuestion({ type, text, choices });
    if (error) {
        status.innerText = error;
        return;
    }

    const qList = getSortedQuestionList();
    const maxOrder = qList.length > 0 ? Math.max(...qList.map(q => q.order || 0)) : 0;

    const qid = generateQuestionId();
    await db.ref(`${PATH.QUESTIONS}/${qid}`).set({
        order: maxOrder + 1,
        type,
        text,
        choices: type === QUESTION_TYPE.CHOICE ? choices : null
    });

    document.getElementById("new-q-text").value = "";
    document.getElementById("new-q-choices").value = "";
    status.innerText = "";
});

/* =========================
   설문 설정 (응답 재열람 허용 여부)
========================= */
function updateSettingsInputsFromConfig() {
    const toggle = document.getElementById("allow-view-toggle");
    if (document.activeElement !== toggle) {
        toggle.checked = currentConfig.allowViewOwnResponse === true;
    }
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
    const checked = document.getElementById("allow-view-toggle").checked;
    await db.ref(`${PATH.CONFIG}/allowViewOwnResponse`).set(checked);
    document.getElementById("settings-status").innerText = "저장되었습니다.";
});

/* =========================
   설문 제어
========================= */
document.getElementById("btn-start").addEventListener("click", async () => {
    const qSnap = await db.ref(`${PATH.QUESTIONS}`).once("value");
    if (!qSnap.val()) {
        alert("질문을 먼저 등록하세요.");
        return;
    }
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.OPEN });
    alert("설문을 시작했습니다.");
});

document.getElementById("btn-end").addEventListener("click", async () => {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.END });
    alert("설문을 종료했습니다.");
});

document.getElementById("btn-reset-responses").addEventListener("click", async () => {
    const ok = confirm("응답을 초기화하시겠습니까?\n(질문 구성은 유지되고, 학생들의 제출 내역만 삭제됩니다)");
    if (!ok) return;

    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const students = studentsSnap.val() || {};
    const updates = {};
    for (const id in students) {
        updates[`${PATH.STUDENTS}/${id}/submitted`] = false;
    }
    updates[`${PATH.RESPONSES}`] = null;
    updates[`${PATH.GAME}/state`] = GAME_STATE.WAIT;

    await db.ref().update(updates);
    alert("응답이 초기화되었습니다.");
});

/* =========================
   학생 목록 실시간 / 제출 현황
========================= */
function listenStudents() {
    db.ref(`${PATH.STUDENTS}`).on("value", (snap) => {
        cachedStudents = snap.val() || {};
        renderStudentList();
        renderResultsSummary();
    });
}

function renderStudentList() {
    const list = document.getElementById("student-list");
    list.innerHTML = "";

    const ids = Object.keys(cachedStudents)
        .map(id => parseInt(id, 10))
        .sort((a, b) => a - b);

    let submittedCount = 0;

    for (const id of ids) {
        const s = cachedStudents[id];
        const submitted = s.submitted === true;
        if (submitted) submittedCount++;

        const row = document.createElement("div");
        row.className = "student-row";
        row.style.cursor = "pointer";
        row.addEventListener("click", () => openStudentResponseModal(id));

        const idSpan = document.createElement("span");
        idSpan.innerText = `#${id}`;

        const statusSpan = document.createElement("span");
        statusSpan.className = `status-badge ${submitted ? "status-done" : "status-offline"}`;
        statusSpan.innerText = submitted ? "제출완료" : "미제출";

        row.appendChild(idSpan);
        row.appendChild(statusSpan);
        list.appendChild(row);
    }

    updateSubmitCountLabel(submittedCount);
}

/* =========================
   학생 개별 응답 모달
========================= */
function openStudentResponseModal(studentId) {
    const modal = document.getElementById("student-response-modal");
    const title = document.getElementById("student-response-title");
    const body = document.getElementById("student-response-body");

    title.innerText = `#${studentId} 번 응답`;
    body.innerHTML = "";

    const student = cachedStudents[studentId];
    if (!student || student.submitted !== true) {
        body.innerHTML = `<p class="hint-text">아직 제출하지 않았습니다.</p>`;
        modal.classList.remove("hidden");
        return;
    }

    const qList = getSortedQuestionList();
    const myAnswers = cachedResponses[studentId] || {};

    if (qList.length === 0) {
        body.innerHTML = `<p class="hint-text">등록된 질문이 없습니다.</p>`;
        modal.classList.remove("hidden");
        return;
    }

    const ul = document.createElement("ul");
    ul.className = "my-response-list";

    qList.forEach((q, idx) => {
        const answer = myAnswers[q.qid];
        const li = document.createElement("li");
        li.innerHTML = `<div class="q-text">${idx + 1}. ${escapeHtmlAdmin(q.text)}</div><div class="q-answer">${answer ? escapeHtmlAdmin(answer) : "(응답 없음)"}</div>`;
        ul.appendChild(li);
    });

    body.appendChild(ul);
    modal.classList.remove("hidden");
}

document.getElementById("btn-close-student-response").addEventListener("click", () => {
    document.getElementById("student-response-modal").classList.add("hidden");
});

function escapeHtmlAdmin(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

function updateSubmitCountLabel(submittedCount) {
    const total = currentConfig ? currentConfig.studentCount : 0;

    let count = submittedCount;
    if (count === undefined) {
        count = 0;
        for (const id in cachedStudents) {
            if (cachedStudents[id].submitted === true) count++;
        }
    }

    document.getElementById("submit-count").innerText = `${count} / ${total}`;
}

/* =========================
   응답 실시간 감시
========================= */
function listenResponses() {
    db.ref(`${PATH.RESPONSES}`).on("value", (snap) => {
        cachedResponses = snap.val() || {};
    });
}
/* =========================
   CSV 다운로드 - 항목별 정리
   형식: 질문 구간별로 번호,답변 나열 (1~studentCount 전부, 미제출 공란)
========================= */
document.getElementById("btn-download-by-item-csv").addEventListener("click", () => {
    if (!currentConfig) return;

    const qList = getSortedQuestionList();
    if (qList.length === 0) {
        alert("등록된 질문이 없습니다.");
        return;
    }

    const studentCount = currentConfig.studentCount || 0;
    const rows = [];

    qList.forEach((q, idx) => {
        rows.push([csvField(`${idx + 1}. ${q.text}`)].join(","));
        rows.push(["번호", "답변"].join(","));
        for (let sid = 1; sid <= studentCount; sid++) {
            const answer = cachedResponses[sid] ? cachedResponses[sid][q.qid] : "";
            rows.push([sid, csvField(answer || "")].join(","));
        }
        rows.push(""); // 질문 사이 빈 줄
    });

    downloadCsv(rows.join("\n"), "설문결과_항목별.csv");
});

/* =========================
   CSV 다운로드 - 학생별 정리
   형식: 행=학생번호(1~studentCount 전부), 열=질문들
========================= */
document.getElementById("btn-download-by-student-csv").addEventListener("click", () => {
    if (!currentConfig) return;

    const qList = getSortedQuestionList();
    if (qList.length === 0) {
        alert("등록된 질문이 없습니다.");
        return;
    }

    const studentCount = currentConfig.studentCount || 0;
    const header = ["번호", ...qList.map((q, idx) => csvField(`${idx + 1}. ${q.text}`))];
    const rows = [header.join(",")];

    for (let sid = 1; sid <= studentCount; sid++) {
        const row = [sid];
        qList.forEach(q => {
            const answer = cachedResponses[sid] ? cachedResponses[sid][q.qid] : "";
            row.push(csvField(answer || ""));
        });
        rows.push(row.join(","));
    }

    downloadCsv(rows.join("\n"), "설문결과_학생별.csv");
});

function csvField(str) {
    return `"${String(str || "").replace(/"/g, '""')}"`;
}

function downloadCsv(content, filename) {
    const csvContent = "\uFEFF" + content;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* =========================
   학생 수 설정 및 명단 생성
========================= */
function updateStudentCountInputFromConfig() {
    const input = document.getElementById("student-count-input");
    if (document.activeElement !== input) {
        input.value = currentConfig.studentCount || 29;
    }
}

document.getElementById("btn-generate-students").addEventListener("click", async () => {
    const status = document.getElementById("student-count-status");
    const studentCount = parseInt(document.getElementById("student-count-input").value, 10);

    if (!studentCount || studentCount < 1) {
        status.innerText = "학생 수는 1 이상이어야 합니다.";
        return;
    }

    await db.ref(`${PATH.CONFIG}/studentCount`).set(studentCount);

    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const existingStudents = studentsSnap.val() || {};
    const additions = {};
    for (let i = 1; i <= studentCount; i++) {
        if (!existingStudents[i]) {
            additions[`${PATH.STUDENTS}/${i}`] = {
                password: String(1000 + i),
                status: STUDENT_STATE.OFFLINE,
                submitted: false
            };
        }
    }

    if (Object.keys(additions).length > 0) {
        await db.ref().update(additions);
        status.innerText = `✅ 총 ${studentCount}명으로 설정, ${Object.keys(additions).length}명 신규 생성됨`;
    } else {
        status.innerText = `✅ 총 ${studentCount}명 (변경 없음, 이미 모두 존재함)`;
    }
});

/* =========================
   학생 비밀번호 CSV 다운로드
========================= */
document.getElementById("btn-download-csv").addEventListener("click", async () => {
    const snap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const data = snap.val() || {};

    const rows = Object.keys(data)
        .map(id => parseInt(id, 10))
        .sort((a, b) => a - b)
        .map(id => `${id},${data[id].password}`);

    downloadCsv(rows.join("\n"), "student_passwords.csv");
});

/* =========================
   학생 비밀번호 CSV 업로드/적용
========================= */
document.getElementById("btn-apply-csv").addEventListener("click", () => {
    const fileInput = document.getElementById("csv-upload");
    const status = document.getElementById("csv-status");
    status.innerText = "";

    const file = fileInput.files[0];
    if (!file) {
        status.innerText = "CSV 파일을 선택하세요.";
        return;
    }

    const maxId = currentConfig?.studentCount || 29;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0);

        const updates = {};
        const errors = [];
        let successCount = 0;

        lines.forEach((line, idx) => {
            const parts = line.split(",").map(p => p.trim());
            if (parts.length !== 2) {
                errors.push(`${idx + 1}행 형식 오류`);
                return;
            }

            const [idStr, pw] = parts;
            const id = parseInt(idStr, 10);

            if (isNaN(id) || id < 1 || id > maxId) {
                errors.push(`${idx + 1}행 번호 오류(${idStr})`);
                return;
            }
            if (!pw) {
                errors.push(`${idx + 1}행 비밀번호 없음`);
                return;
            }

            updates[`${PATH.STUDENTS}/${id}/password`] = pw;
            successCount++;
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        let message = `✅ ${successCount}명 비밀번호 적용 완료`;
        if (errors.length > 0) {
            message += ` / ⚠️ 오류 ${errors.length}건: ${errors.join(", ")}`;
        }
        status.innerText = message;
        fileInput.value = "";
    };

    reader.readAsText(file);
});

/* =========================
   게임 상태 표시
========================= */
function listenGame() {
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        const game = snap.val();
        if (!game) return;

        let status = "";
        if (game.state === GAME_STATE.WAIT) status = "대기 중";
        if (game.state === GAME_STATE.OPEN) status = "진행 중";
        if (game.state === GAME_STATE.END) status = "종료";

        document.getElementById("game-status-text").innerText = `현재 상태: ${status}`;
    });
}