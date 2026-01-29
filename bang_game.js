import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Firebase 초기화
const firebaseConfig = {
  apiKey: "AIzaSyDhg71bf9JeHNO6xvjP0OjLRTi-wLpIB6s",
  authDomain: "kbsmcinfection-90d6f.firebaseapp.com",
  projectId: "kbsmcinfection-90d6f",
  storageBucket: "kbsmcinfection-90d6f.firebasestorage.app",
  messagingSenderId: "985054769566",
  appId: "1:985054769566:web:54def1e91ed1517734e68f",
  measurementId: "G-7R77CDFFKL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --------------------------

export async function saveScoreToFirebase(playerName, department, score) {
  try {
    await addDoc(collection(db, "rankings"), {
      name: playerName,
      department: department,
      score,
      timestamp: new Date()
    });
    console.log("✅ 점수 저장 완료");

    // 성공 시 알림
    showSaveAlert("✅ 점수 저장 완료!", "success");

  } catch (error) {
    console.error("❌ 점수 저장 실패:", error);

    // 실패 시 알림
    showSaveAlert("❌ 점수 저장 실패!", "error");
  }
}

// 공용 알림창 함수
function showSaveAlert(message, type = "info") {
  const alertBox = document.createElement('div');
  alertBox.innerText = message;
  alertBox.style.position = 'fixed';
  alertBox.style.top = '20px';
  alertBox.style.left = '50%';
  alertBox.style.transform = 'translateX(-50%)';
  alertBox.style.padding = '12px 24px';
  alertBox.style.borderRadius = '12px';
  alertBox.style.fontSize = '16px';
  alertBox.style.zIndex = '9999';
  alertBox.style.transition = 'opacity 0.5s ease';
  alertBox.style.opacity = '1';

  // 타입에 따라 색상 다르게 표시
  if (type === "success") {
    alertBox.style.background = 'rgba(46, 204, 113, 0.9)'; // 초록색
    alertBox.style.color = 'white';
  } else if (type === "error") {
    alertBox.style.background = 'rgba(231, 76, 60, 0.9)'; // 빨간색
    alertBox.style.color = 'white';
  } else {
    alertBox.style.background = 'rgba(52, 152, 219, 0.9)'; // 파랑
    alertBox.style.color = 'white';
  }

  document.body.appendChild(alertBox);

  setTimeout(() => {
    alertBox.style.opacity = '0';
    setTimeout(() => alertBox.remove(), 500);
  }, 2000);
}

// --------------------------
// Top5 랭킹 불러오기 (캐시 + 1회만 호출)
// --------------------------
let rankingsLoaded = false;
let cachedRankings = [];
let firestoreReadCount = 0;

export async function loadTopRankings(callback) {
  if (rankingsLoaded) {
    console.log(`📊 Firestore 읽기 호출 횟수: ${firestoreReadCount}`);
    callback(cachedRankings);
    return;
  }

  try {
    const q = query(
      collection(db, "rankings"),
      orderBy("score", "desc"),
      limit(5)
    );

    const snapshot = await getDocs(q);
    const rankings = [];
    snapshot.forEach(doc => rankings.push(doc.data()));

    cachedRankings = rankings;
    rankingsLoaded = true;

    callback(rankings);
  } catch (err) {
    console.error("❌ 랭킹 불러오기 실패:", err);
    callback([]);
  }
}

// ==========================
// Canvas & Game 초기화
// ==========================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width = 850;
const HEIGHT = canvas.height = 1500;

// --------------------------
// 이미지 로딩
// --------------------------
const imageSources = {
  bang_default: "img/bang.png",
  bang_dental: "img/bang_dental.png",
  bang_n95: "img/bang_n95.png",
  bang_gown: "img/bang_gown.png",
  bang_needle: "img/bang_needle.png",
  pt1: "img/pt1.png",
  pt2: "img/pt2.png",
  pt3: "img/pt3.png",
  pt4: "img/pt4.png",
  background: "img/bg.jpg",
  startgame: "img/start.jpg",
  overgame: "img/over.jpg",
  ranking: "img/ranking.jpg"
};

const images = {};
let imagesLoaded = 0;
const totalImages = Object.keys(imageSources).length;

for (const key in imageSources) {
  const img = new Image();
  img.src = imageSources[key];
  img.onload = () => {
    imagesLoaded++;
    if (imagesLoaded === totalImages) startGame();
  };
  images[key] = img;
}

// ==========================
// 게임 상태
// ==========================
let bangImg;
let bang = { x: WIDTH / 2 - 100, y: HEIGHT - 415, width: 200, height: 170 };
let patients = [];
let score = 0;
let stage = 1;
let speed = 4;
let currentProtection = null;
let gameStarted = false;
let gameOver = false;
let passedPatients = 0;
let nameEntered = false;
let showHeart = false;
let heartTimer = 0;
let stageUpTimer = 0;
let stageUpHandled = false;

// --------------------------
// 보호구 매핑
// --------------------------
const protectionMap = {
  "덴탈마스크": ["백일해", "인플루엔자", "성홍열", "유행성 이하선염", "풍진"],
  "N95": ["결핵", "수두", "홍역", "파종성 대상포진"],
  "가운+장갑": ["CRE", "Candida auris", "MRSA", "옴", "C.difficile", "MRAB", "MRPA", "Rotavirus"],
  "안전바늘" : ["C형간염","B형간염","HIV"]
};

// --------------------------
// 텍스트 그리기
// --------------------------
function drawTextWithBackground(text, x, y, font="bold 9px Galmuri11", textColor="black", bgColor="white") {
  ctx.font = font;
  ctx.textBaseline = "top";
  const padding = 5;

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const fontSizeMatch = font.match(/\d+/);
  const textHeight = fontSizeMatch ? parseInt(fontSizeMatch[0], 10) : 10;

  ctx.fillStyle = bgColor;
  ctx.fillRect(x - padding, y - padding, textWidth + padding*2, textHeight + padding*2);

  ctx.fillStyle = textColor;
  ctx.fillText(text, x, y);
}

// ==========================
// 입력 처리
// ==========================
function handleInput(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let clientX, clientY;
  if (e.type.startsWith("touch")) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const mx = (clientX - rect.left) * scaleX;
  const my = (clientY - rect.top) * scaleY;

  if (rankingShown) {
    return; 
  }

  // 게임 시작 버튼 클릭
  if (!gameStarted) {
    const btnX1 = WIDTH/2 - 225;
    const btnX2 = WIDTH/2 + 222;
    const btnY1 = HEIGHT/2 + 460;
    const btnY2 = HEIGHT/2 + 610;
    if (mx >= btnX1 && mx <= btnX2 && my >= btnY1 && my <= btnY2) {
      gameStarted = true;
      resetGame();
      requestAnimationFrame(gameLoop);
    }
    return;
  }

  // 게임 오버 후 버튼
  if (gameOver) {
    const restartBtn = { x1: WIDTH/2-245, x2: WIDTH/2+220, y1: HEIGHT/2+260, y2: HEIGHT/2+410 };
    const quitBtn = { x1: WIDTH/2-245, x2: WIDTH/2+220, y1: HEIGHT/2+430, y2: HEIGHT/2+580 };

    if (mx >= restartBtn.x1 && mx <= restartBtn.x2 && my >= restartBtn.y1 && my <= restartBtn.y2) {
      resetGame();
      requestAnimationFrame(gameLoop);
    } else if (mx >= quitBtn.x1 && mx <= quitBtn.x2 && my >= quitBtn.y1 && my <= quitBtn.y2) {
      stopGameLoop();
      if (!rankingShown) showRankingScreen();
    }
    return;
  }

  // 게임 중 보호구 선택
  if (mx >= WIDTH/2 - 360 && mx <= WIDTH/2 - 201 && my >= HEIGHT - 240 && my <= HEIGHT - 6) {
    currentProtection = "덴탈마스크"; bangImg = images.bang_dental;
  } else if (mx >= WIDTH/2 - 170 && mx <= WIDTH/2 - 20 && my >= HEIGHT - 240 && my <= HEIGHT - 6) {
    currentProtection = "N95"; bangImg = images.bang_n95;
  } else if (mx >= WIDTH/2 + 10 && mx <= WIDTH/2 + 160 && my >= HEIGHT - 240 && my <= HEIGHT - 6) {
    currentProtection = "가운+장갑"; bangImg = images.bang_gown;
  } else if (mx >= WIDTH/2 + 190 && mx <= WIDTH/2 + 330 && my >= HEIGHT - 240 && my <= HEIGHT - 6) {
    currentProtection = "안전바늘"; bangImg = images.bang_needle;
  }
}

canvas.addEventListener("click", handleInput);
canvas.addEventListener("touchstart", e => { e.preventDefault(); handleInput(e); }, { passive: false });

// ==========================
// 게임 함수
// ==========================
function createPatient(offset=0) {
  let diseases = ["인플루엔자","성홍열","결핵","수두","옴","MRSA","CRE","HIV","백일해","유행성 이하선염","홍역","Candida auris","B형간염","C형간염","풍진","파종성 대상포진","C.difficile","MRAB","MRPA","Rotavirus"];

  const disease = diseases[Math.floor(Math.random()*diseases.length)];
  const patientImages = [images.pt1, images.pt2, images.pt3, images.pt4];
  const image = patientImages[Math.floor(Math.random()*patientImages.length)];

  return { x: WIDTH/2 - 70, y: -offset, width:165, height:225, disease, image };
}

function resetGame() {
  bangImg = images.bang_default;
  currentProtection = null;
  gameOver = false;
  nameEntered = false;
  score = 0;
  stage = 1;
  passedPatients = 0;
  speed = 4;
  patients = [createPatient()];
}

function stopGameLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

let animationId;
let rankingFetchInProgress = false;
let rankingShown = false;

// ==========================
// 게임 루프
// ==========================
function gameLoop() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!gameStarted) {
    ctx.drawImage(images.startgame, 0, 0, WIDTH, HEIGHT);
    return;
  }

  if (gameOver) {
    ctx.drawImage(images.overgame, 0, 0, WIDTH, HEIGHT);
    ctx.font = "bold 35px Galmuri11";
    ctx.fillStyle = "#000027ff";
    ctx.fillText(`${score} 점`, WIDTH / 2 - 50, HEIGHT / 2 + 180);

    if (!nameEntered && window.playerInfo) {
      nameEntered = true;
      const { playerName, department } = window.playerInfo;
      saveScoreToFirebase(playerName, department, score);
    }

    // 게임 오버 시 Firestore 읽기는 버튼 이벤트에서 처리
    return;
  }

    // 배경 및 방글이
  ctx.drawImage(images.background,0,0,WIDTH,HEIGHT);
  ctx.drawImage(bangImg, bang.x, bang.y, bang.width, bang.height);

  if (showHeart) {
  ctx.save();
  ctx.globalAlpha = 0.85; // 살짝 투명하게
  ctx.font = "bold 50px Galmuri11";
  ctx.fillStyle = "red";
  ctx.fillText("♥", bang.x + 10, bang.y + 5);
  ctx.restore();
  heartTimer--;
  if (heartTimer <= 0) showHeart = false;
}

  drawTextWithBackground(`스테이지: ${stage}`,10,10,"bold 35px Galmuri11","white","#404040");
  drawTextWithBackground(`점수: ${score}`,10,70,"bold 35px Galmuri11","yellow","#404040");

  if (stageUpTimer > 0) {
    let messageLines = ["Level UP!", "환자가 빨리 다가옵니다!"];
    } 

    //게임 배경 그대로
    ctx.drawImage(images.background, 0, 0, WIDTH, HEIGHT);  

    ctx.font = "bold 40px Galmuri11";
    ctx.textBaseline = "top";

    const centerY = HEIGHT / 2 - 100;
    const padding = 10;

    messageLines.forEach((line, i) => {
      const textWidth = ctx.measureText(line).width;
      const textHeight = 40; // 폰트 크기 기준
      const x = WIDTH / 2 - textWidth / 2;
      const y = centerY + i * 60;

      ctx.fillStyle = "black";
      ctx.fillRect(x - padding, y - padding, textWidth + padding * 2, textHeight + padding * 2);

      ctx.fillStyle = i === 0 ? "yellow" : "white";
      ctx.fillText(line, x, y);
    });

    stageUpTimer--;

    if (stageUpTimer === 0 && !stageUpHandled) {
      patients = [];
      const maxPatients = stage < 7 ? 1 : 1;
      const fixedGap = 500;

      for (let i = 0; i < maxPatients; i++) {
        const offset = i * fixedGap;
        patients.push(createPatient(offset));
      }
      stageUpHandled = true;
    }

    requestAnimationFrame(gameLoop);
    return;
  }



  // 환자 처리
  const maxPatients = stage<7?1:1;
  while (patients.length<maxPatients) patients.push(createPatient(400));

  for (let i=patients.length-1;i>=0;i--) {
    const pt = patients[i];
    pt.y += speed;
    ctx.drawImage(pt.image, pt.x, pt.y, pt.width, pt.height);

    // 질병 이름
    const text = pt.disease || "???";
    ctx.font = "bold 33px Galmuri11";
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle="rgba(255, 255, 255, 0.51)";
    ctx.fillRect(pt.x+pt.width/2 - textWidth/2 -6, pt.y-36, textWidth+12,40);
    ctx.fillStyle="black";
    ctx.fillText(text, pt.x+pt.width/2 - textWidth/2, pt.y-30);

    if (pt.y+pt.height >= bang.y) {
      const correct = protectionMap[currentProtection]?.includes(pt.disease);
      if (correct) { score+=1; passedPatients++; patients.splice(i,1); showHeart=true; heartTimer=15; }
      else { gameOver=true; patients.splice(i,1); }
    }
  }

  // 스테이지 업
  if (passedPatients >= 10 && stage < 50) {
  stage++;
  passedPatients = 0;
  speed += 1; 
  stageUpTimer = 50;
  stageUpHandled = false;
}

  animationId = requestAnimationFrame(gameLoop);
}

// ==========================
// 랭킹 화면
// ==========================

function showRankingScreen() {
  if (rankingShown) return; // 이미 화면 표시 완료
  rankingShown = true;

  // 게임 루프 중지
  stopGameLoop();

  // 배경 그리기
  ctx.drawImage(images.ranking, 0, 0, WIDTH, HEIGHT);

  // 이미 캐시가 있다면 바로 그리기
  if (rankingsLoaded) {
    drawRanking(cachedRankings);
    return;
  }

  // 중복 요청 방지
  if (rankingFetchInProgress) return;
  rankingFetchInProgress = true;

  // Firestore에서 Top5 랭킹 로드
  loadTopRankings((rankings) => {
    cachedRankings = rankings;
    rankingsLoaded = true;
    rankingFetchInProgress = false;
    drawRanking(rankings);
  });
}

// 실제 화면에 랭킹 텍스트 그리기
function drawRanking(rankings) {
  rankings.forEach((entry, index) => {
    ctx.font = "bold 35px Galmuri11";
    ctx.fillStyle = "#00003E";
    ctx.fillText(
      `${entry.department}, ${entry.name}, ${entry.score}점`,
      WIDTH / 2 - 200,
      HEIGHT / 2 - 100 + index * 170
    );
  });
}

// ==========================
// 게임 시작
// ==========================
function startGame() {
  bangImg = images.bang_default;
  requestAnimationFrame(gameLoop);
}

// bang_game.js 마지막 부분 
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const dIn = document.getElementById("departmentInput");
  const nIn = document.getElementById("nameInput");

  // [추가] 페이지 열자마자 기존 기록을 리스트에 넣기
  const dList = document.getElementById("deptOptions");
  const nList = document.getElementById("nameOptions");
  if(localStorage.getItem("lastD")) dList.innerHTML = `<option value="${localStorage.getItem("lastD")}">`;
  if(localStorage.getItem("lastN")) nList.innerHTML = `<option value="${localStorage.getItem("lastN")}">`;

  startBtn.addEventListener("click", () => {
    const department = dIn.value.trim();
    const name = nIn.value.trim();

    if (!department || !name) {
      alert("이름과 부서를 입력해주세요!");
      return;
    }

    // [추가] 브라우저에 입력값 저장
    localStorage.setItem("lastD", department);
    localStorage.setItem("lastN", name);

    window.playerInfo = { department, playerName: name };
    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameCanvas").style.display = "block";
    gameStarted = false;
    requestAnimationFrame(gameLoop);
  });
});









