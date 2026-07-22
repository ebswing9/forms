const firebaseConfig = {
  apiKey: "AIzaSyAeQSe78NlRIrPZDINajaJaZtoKJonD5dc",
  authDomain: "forms-1082d.firebaseapp.com",
  databaseURL: "https://forms-1082d-default-rtdb.firebaseio.com",
  projectId: "forms-1082d",
  storageBucket: "forms-1082d.firebasestorage.app",
  messagingSenderId: "796364305408",
  appId: "1:796364305408:web:868c8dfecf207a041f14e5"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================
// 🔥 공통 경로
// ==========================
const PATH = {
  GAME: "game",
  CONFIG: "config",
  STUDENTS: "students",
  QUESTIONS: "questions",
  RESPONSES: "responses"
};

// ==========================
// 🎮 게임 상태
// ==========================
const GAME_STATE = {
  WAIT: "WAIT",
  OPEN: "OPEN",
  END: "END"
};

// ==========================
// 🧑 학생 상태
// ==========================
const STUDENT_STATE = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  DONE: "DONE"
};

// ==========================
// ❓ 질문 유형
// ==========================
const QUESTION_TYPE = {
  SHORT: "short",   // 단답형 (한 줄)
  TEXT: "text",     // 서술형 (여러 줄)
  CHOICE: "choice"  // 객관식
};

// ==========================
// 🧠 설정(config) 기본값
// - allowViewOwnResponse: 학생이 제출 후 본인 응답을 다시 볼 수 있는지 여부
// ==========================
function getInitialConfig() {
  return {
    studentCount: 29,
    allowViewOwnResponse: true
  };
}

// ==========================
// 🧠 게임 상태 기본값
// ==========================
function getInitialGame(adminPassword) {
  return {
    state: GAME_STATE.WAIT,
    adminPassword: adminPassword || "1234"
  };
}

// ==========================
// 🧑 학생 데이터 생성 함수 (1 ~ studentCount)
// ==========================
function generateStudents(studentCount) {
  const students = {};
  for (let i = 1; i <= studentCount; i++) {
    students[i] = {
      password: String(1000 + i),
      status: STUDENT_STATE.OFFLINE,
      submitted: false
    };
  }
  return students;
}

// ==========================
// 🆔 질문 고유 id 생성
// ==========================
function generateQuestionId() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ==========================
// ✅ 질문 하나 검증
// - text: 비어있으면 안 됨
// - choice: 선택지가 2개 이상이어야 함
// 문제 있으면 에러 메시지, 없으면 null
// ==========================
function validateQuestion({ type, text, choices }) {
  if (!text || !text.trim()) {
    return "질문 내용을 입력하세요.";
  }
  if (type === QUESTION_TYPE.CHOICE) {
    if (!Array.isArray(choices) || choices.length < 2) {
      return "선택지를 2개 이상 입력하세요.";
    }
  } else if (type !== QUESTION_TYPE.TEXT && type !== QUESTION_TYPE.SHORT) {
    return "질문 유형이 올바르지 않습니다.";
  }
  return null;
}

// ==========================
// 🔐 인증(캡차) 없이도 되는 순수 제출형 시스템이라
// 자리배치/선착순 신청과 달리 인증 문제/정답 개념은 사용하지 않음
// ==========================

// ==========================
// ⏱ sleep (UI용)
// ==========================
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}