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
  TEXT: "text",     // 서술형 (여러 줄) - 퀴즈 모드에서는 사용 안 함
  CHOICE: "choice"  // 객관식
};

// ==========================
// 📋 사이트 모드
// ==========================
const SITE_MODE = {
  SURVEY: "survey",
  QUIZ: "quiz"
};

// ==========================
// 🧠 설정(config) 기본값
// - allowViewOwnResponse: 학생이 제출 후 본인 응답을 다시 볼 수 있는지 여부
// - mode: "survey"(설문) | "quiz"(퀴즈, 채점)
// - showScoreToStudent: 퀴즈 모드일 때, 학생에게 점수를 공개할지 여부
// ==========================
function getInitialConfig() {
  return {
    studentCount: 29,
    allowViewOwnResponse: true,
    mode: SITE_MODE.SURVEY,
    showScoreToStudent: false
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
// - mode가 "quiz"이면: 서술형은 허용 안 함, 정답(correctAnswer)이 반드시 있어야 함
//   (객관식이면 정답이 선택지 목록 안에 있어야 함)
// - mode가 "survey"이면: 기존과 동일 (정답 개념 없음)
// ==========================
function validateQuestion({ mode, type, text, choices, correctAnswer }) {
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

  if (mode === SITE_MODE.QUIZ) {
    if (type === QUESTION_TYPE.TEXT) {
      return "퀴즈 모드에서는 서술형 질문을 만들 수 없습니다.";
    }
    if (!correctAnswer || !String(correctAnswer).trim()) {
      return "퀴즈 모드에서는 정답을 입력해야 합니다.";
    }
    if (type === QUESTION_TYPE.CHOICE && !choices.includes(correctAnswer)) {
      return "정답은 선택지 중 하나여야 합니다.";
    }
  }

  return null;
}

// ==========================
// ✅ 답변이 정답인지 채점
// - 단답형: 앞뒤 공백 무시하고 정확히 일치해야 정답
// - 객관식: 정확히 일치해야 정답
// ==========================
function isAnswerCorrect(question, answer) {
  if (!question.correctAnswer) return null; // 채점 대상이 아닌 질문(정답 없음)
  return String(answer || "").trim() === String(question.correctAnswer).trim();
}

// ==========================
// ⏱ sleep (UI용)
// ==========================
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}