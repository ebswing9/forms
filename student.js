/* =========================
   전역 상태
========================= */
let myId = null;
let myData = null;
let currentGame = null;
let currentConfig = null;
let questions = [];
let selectedChoices = {}; // { qid: 선택한 값 } - 객관식 답변 임시 저장용

/* =========================
   설정(config) 로드
========================= */
async function loadConfig() {
    const snap = await db.ref(`${PATH.CONFIG}`).once("value");
    currentConfig = snap.val();
    if (currentConfig) {
        document.getElementById("student-id").placeholder = `번호 (1~${currentConfig.studentCount})`;
    }
}

/* =========================
   실시간 접속 감지는 이번 사이트에서는 사용하지 않음
   (요구사항: 실시간 접속 현황 불필요)
   다만 status 필드 자체는 남겨두어, 필요시 나중에 재사용 가능하도록 함
========================= */

/* =========================
   화면 전환
========================= */
function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
}

/* =========================
   로그인 처리
========================= */
document.getElementById("btn-login").addEventListener("click", async () => {
    const id = document.getElementById("student-id").value;
    const pw = document.getElementById("student-pw").value;
    const error = document.getElementById("login-error");
    error.innerText = "";

    if (!id || !pw) {
        error.innerText = "번호와 비밀번호를 입력하세요.";
        return;
    }

    if (!currentConfig) {
        await loadConfig();
    }
    if (currentConfig && parseInt(id, 10) > currentConfig.studentCount) {
        error.innerText = `현재 학생 수는 ${currentConfig.studentCount}명입니다.`;
        return;
    }

    const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
    const data = snap.val();

    if (!data) {
        error.innerText = "존재하지 않는 번호입니다.";
        return;
    }
    if (data.password !== pw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    myId = id;
    myData = data;
    localStorage.setItem("myId", myId);

    await db.ref(`${PATH.STUDENTS}/${id}`).update({
        status: STUDENT_STATE.ONLINE
    });

    initListeners();
});

/* =========================
   로그아웃 처리
========================= */
async function logout() {
    if (myId) {
        await db.ref(`${PATH.STUDENTS}/${myId}`).update({
            status: STUDENT_STATE.OFFLINE
        });
    }
    localStorage.removeItem("myId");
    location.reload();
}

document.getElementById("btn-logout-wait")?.addEventListener("click", logout);
document.getElementById("btn-logout-result")?.addEventListener("click", logout);

/* =========================
   리스너 통합
========================= */
function initListeners() {
    db.ref(`${PATH.CONFIG}`).on("value", (snap) => {
        currentConfig = snap.val();
    });

    // 게임 상태 감시
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        currentGame = snap.val();
        if (!currentGame) return;

        if (currentGame.state === GAME_STATE.WAIT) {
            showView("wait-view");
            document.getElementById("wait-id").innerText = myId;
        } else if (currentGame.state === GAME_STATE.OPEN) {
            if (myData?.submitted) {
                showResult();
            } else {
                loadQuestionsAndShow();
            }
        } else if (currentGame.state === GAME_STATE.END) {
            showResult();
        }
    });

    // 내 데이터 감시
    db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
        myData = snap.val();
    });
}

/* =========================
   질문 불러와서 설문 화면 표시
========================= */
async function loadQuestionsAndShow() {
    const snap = await db.ref(`${PATH.QUESTIONS}`).once("value");
    const data = snap.val() || {};

    questions = Object.keys(data).map(qid => ({ qid, ...data[qid] }));
    questions.sort((a, b) => (a.order || 0) - (b.order || 0));

    selectedChoices = {};
    renderQuestions();
    showView("main-view");
}

function renderQuestions() {
    const container = document.getElementById("questions-container");
    container.innerHTML = "";

    if (questions.length === 0) {
        container.innerHTML = `<p class="hint-text">등록된 질문이 없습니다.</p>`;
        return;
    }

    questions.forEach((q, idx) => {
        const block = document.createElement("div");
        block.className = "question-block";

        const title = document.createElement("div");
        title.className = "question-title";
        title.innerText = `${idx + 1}. ${q.text}`;
        block.appendChild(title);

  if (q.type === QUESTION_TYPE.SHORT) {
            const input = document.createElement("input");
            input.type = "text";
            input.dataset.qid = q.qid;
            input.placeholder = "답변을 입력하세요";
            block.appendChild(input);
        } else if (q.type === QUESTION_TYPE.TEXT) {
            const textarea = document.createElement("textarea");
            textarea.rows = 3;
            textarea.dataset.qid = q.qid;
            textarea.placeholder = "답변을 입력하세요";
            block.appendChild(textarea);
        } else if (q.type === QUESTION_TYPE.CHOICE) {
            const choiceGrid = document.createElement("div");
            choiceGrid.className = "choice-grid";

            (q.choices || []).forEach(choice => {
                const card = document.createElement("div");
                card.className = "choice-card";
                card.innerText = choice;

                if (selectedChoices[q.qid] === choice) {
                    card.classList.add("selected");
                }

                card.addEventListener("click", () => {
                    selectedChoices[q.qid] = choice;
                    // 같은 질문의 다른 카드 선택 해제
                    choiceGrid.querySelectorAll(".choice-card").forEach(c => c.classList.remove("selected"));
                    card.classList.add("selected");
                });

                choiceGrid.appendChild(card);
            });

            block.appendChild(choiceGrid);
        }

        container.appendChild(block);
    });
}

/* =========================
   제출 처리
========================= */
document.getElementById("btn-submit").addEventListener("click", async () => {
    const error = document.getElementById("submit-error");
    error.innerText = "";

    const answers = {};
    for (const q of questions) {
        if (q.type === QUESTION_TYPE.SHORT) {
            const input = document.querySelector(`input[data-qid="${q.qid}"]`);
            answers[q.qid] = (input?.value || "").trim();
        } else if (q.type === QUESTION_TYPE.TEXT) {
            const textarea = document.querySelector(`textarea[data-qid="${q.qid}"]`);
            answers[q.qid] = (textarea?.value || "").trim();
        } else if (q.type === QUESTION_TYPE.CHOICE) {
            answers[q.qid] = selectedChoices[q.qid] || "";
        }
    }

    // 모든 질문에 답변이 채워져 있는지 확인 (공란 제출 방지)
    const emptyQuestion = questions.find(q => !answers[q.qid]);
    if (emptyQuestion) {
        const idx = questions.indexOf(emptyQuestion) + 1;
        error.innerText = `${idx}번 질문에 답변을 작성해주세요.`;
        return;
    }

    // 이미 제출했는지 재확인
    const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
    const data = snap.val();
    if (data && data.submitted) {
        error.innerText = "이미 제출하셨습니다.";
        showResult();
        return;
    }

    await db.ref(`${PATH.RESPONSES}/${myId}`).set(answers);
    await db.ref(`${PATH.STUDENTS}/${myId}`).update({ submitted: true });

    showResult();
});

/* =========================
   결과 화면 (내 제출 내역, 재열람 허용 시에만 상세 표시)
========================= */
async function showResult() {
    showView("result-view");
    document.getElementById("result-id").innerText = myId;

    const container = document.getElementById("my-response-container");
    container.innerHTML = "";

    if (!currentConfig || !currentConfig.allowViewOwnResponse) {
        container.innerHTML = `<p>제출이 완료되었습니다. 감사합니다.</p>`;
        return;
    }

    const [responseSnap, questionSnap] = await Promise.all([
        db.ref(`${PATH.RESPONSES}/${myId}`).once("value"),
        db.ref(`${PATH.QUESTIONS}`).once("value")
    ]);

    const myAnswers = responseSnap.val() || {};
    const allQuestions = questionSnap.val() || {};

    const qList = Object.keys(allQuestions)
        .map(qid => ({ qid, ...allQuestions[qid] }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (qList.length === 0) {
        container.innerHTML = `<p>제출한 응답이 없습니다.</p>`;
        return;
    }

    const ul = document.createElement("ul");
    ul.className = "my-response-list";

    qList.forEach(q => {
        const li = document.createElement("li");
        const answer = myAnswers[q.qid] || "(응답 없음)";
        li.innerHTML = `<div class="q-text">${escapeHtml(q.text)}</div><div class="q-answer">${escapeHtml(answer)}</div>`;
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", async () => {
    await loadConfig();

    const savedId = localStorage.getItem("myId");
    if (savedId) {
        myId = savedId;
        const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
        myData = snap.val();
        if (myData) {
            await db.ref(`${PATH.STUDENTS}/${myId}`).update({
                status: STUDENT_STATE.ONLINE
            });
            initListeners();
        }
    }
});