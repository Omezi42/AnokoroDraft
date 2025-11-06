// ===================================================
// 1. 必要な機能（モジュール）を Firebase からインポート
// ===================================================
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  connectAuthEmulator // エミュレータ接続用
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection,
  connectFirestoreEmulator // エミュレータ接続用
} from "firebase/firestore";
import { 
  getFunctions, 
  httpsCallable,
  connectFunctionsEmulator // エミュレータ接続用
} from "firebase/functions";


// ===================================================
// 2. Firebase の初期化とエミュレータへの接続
// ===================================================

// フェーズ2で取得したあなたの firebaseConfig を貼り付けます
const firebaseConfig = {
  apiKey: "AIzaSyBQTAg9UosqFyqixNXPeNBndZXF4cqkw2k",
  authDomain: "anokoro-draft-app.firebaseapp.com",
  projectId: "anokoro-draft-app",
  storageBucket: "anokoro-draft-app.firebasestorage.app",
  messagingSenderId: "380768118987",
  appId: "1:380768118987:web:1e880a9faa7207a942d34e"
};

// Firebase アプリを初期化
const app = initializeApp(firebaseConfig);

// 各サービス（認証、DB、関数）のインスタンスを取得
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// ★★★【最重要】ローカルテストのため、エミュレータに接続します ★★★
// (このコードは、本番デプロイ（GitHub Pagesへの公開）の前に削除します)
connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★


// ===================================================
// 3. HTML要素（DOM）の参照を取得
// ===================================================
const roomJoinContainer = document.getElementById("room-join-container");
const usernameInput = document.getElementById("username-input");
const joinRoomButton = document.getElementById("join-room-button");
const draftContainer = document.getElementById("draft-container");
const hostAdminPanel = document.getElementById("host-admin-panel");
const resolvePhaseButton = document.getElementById("resolve-phase-button");
const nextRoundButton = document.getElementById("next-round-button");
const participantGridContainer = document.getElementById("participant-grid-container");
const cardSearchInput = document.getElementById("card-search-input");
const cardListElement = document.getElementById("card-list");
const submitPickButton = document.getElementById("submit-pick-button");
const myPicksList = document.getElementById("my-picks-list");
const activityLogList = document.getElementById("activity-log-list");
const cardModal = document.getElementById("card-modal");
const modalImage = document.getElementById("modal-image");

// ===================================================
// 4. グローバル変数（アプリの状態）
// ===================================================
let currentUserId = null;     // ログイン中のユーザーUID
let currentRoomId = "main-room"; // (簡単のためルームIDを固定)
let allCardsData =[];         // card_list.json の全データ
let availableCardIds =[];  // このラウンドでまだピック可能なカードID
let selectedPick = null;      // 自分が選択中のカードID


// ===================================================
// 5. メインロジック（認証とアプリの開始）
// ===================================================

// 認証状態を監視します [1, 2, 3, 4]
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ユーザーが匿名ログインに成功した場合
    currentUserId = user.uid;
    console.log("匿名認証成功:", currentUserId);
    
    // この時点で初めて「ルーム参加UI」を表示する
    roomJoinContainer.classList.remove("hidden");

  } else {
    // ユーザーがまだログインしていない場合
    console.log("匿名認証を試行します...");
    signInAnonymously(auth).catch((error) => {
      console.error("匿名認証に失敗:", error);
    });
  }
});


// ===================================================
// 6. Firestore リアルタイムリスナー (データの購読)
// ===================================================

// ドラフトアプリのメイン処理を開始する関数
function startDraftApp(roomId, userId, username) {
  // 1. ルーム参加UIを隠し、メインのドラフト画面を表示
  roomJoinContainer.classList.add("hidden");
  draftContainer.classList.remove("hidden");

  // 2. card_list.json を読み込む 
  fetch('/data/card_list.json') // (Viteの public/data/card_list.json を想定)
  .then(response => response.json())
  .then(data => {
      allCardsData = data;
      console.log(`カードリスト(${allCardsData.length}枚)をロードしました`);
      // JSONのロードが完了してから、リストを初回描画
      renderCardList();
    });

  // 3. ルームのメイン情報を監視 (onSnapshot)
  // (利用可能なカードリストやホストIDなどを取得)
  const roomRef = doc(db, "rooms", roomId);
  onSnapshot(roomRef, (roomDoc) => {
    if (!roomDoc.exists()) {
      console.warn("ルームがまだ存在しません");
      return;
    }
    const roomData = roomDoc.data();
    availableCardIds = roomData.availableCardIds ||[];
    
    // 自分がホストかどうかをチェック [5, 6]
    if (roomData.hostId === currentUserId) {
      hostAdminPanel.classList.remove("hidden");
    }

    // 利用可能カードリスト(UI)を再描画
    renderCardList();
  });

  // 4. 参加者リストを監視 (onSnapshot) [7, 8, 9, 10]
  // (これが参加者グリッドをリアルタイムで更新する核となる)
  const participantsRef = collection(db, "rooms", roomId, "participants");
  onSnapshot(participantsRef, (snapshot) => {
    const participantsData = snapshot.docs.map(doc => ({ id: doc.id,...doc.data() }));
    // ★★★ バグ修正のため、ここで renderParticipantGrid を呼び出す ★★★
    renderParticipantGrid(participantsData);
  });

  // 5. 自分の獲得カードリストを監視 (onSnapshot)
  const myPicksRef = collection(db, "rooms", roomId, "draftPicks");
  onSnapshot(myPicksRef, (snapshot) => {
    const allPicks = snapshot.docs.map(doc => doc.data());
    const myPicks = allPicks.filter(pick => pick.userId === currentUserId && pick.status === 'won');
    renderMyPicks(myPicks);
  });

  // 6. アクティビティログを監視 (onSnapshot) [11, 12, 13, 14]
  const logRef = collection(db, "rooms", roomId, "draftLog");
  // (orderBy と onSnapshot を組み合わせるにはインデックスが必要なため、
  //  クライアント側でソートする)
  onSnapshot(logRef, (snapshot) => {
    const logData = snapshot.docs.map(doc => doc.data());
    // ログをタイムスタンプでソート (昇順)
    logData.sort((a, b) => a.timestamp?.seconds - b.timestamp?.seconds);
    renderActivityLog(logData);
  });
}


// ===================================================
// 7. UIレンダリング（描画）関数
// ===================================================

// (A) 参加者グリッドを描画する
// ★★★【バグ修正】★★★
// この関数が、ホストボタンの表示ロジックを含む、バグの根本原因でした。
// allSubmittedOrWon という曖昧な変数ではなく、各ステータスを正確にカウントするロジックに変更します。
function renderParticipantGrid(participants) {
  participantGridContainer.innerHTML = ""; // 一旦リセット
  
  let pickingCount = 0;
  let submittedCount = 0;
  let wonCount = 0;
  const totalParticipants = participants.length;

  for (const participant of participants) {
    const card = document.createElement("div");
    card.className = `participant-card status-${participant.status}`;
    card.textContent = participant.username;
    
    participantGridContainer.appendChild(card);
    
    // 各ステータスの人数をカウント
    if (participant.status === 'picking') pickingCount++;
    if (participant.status === 'submitted') submittedCount++;
    if (participant.status === 'round_won') wonCount++;
  }
  
  // ★★★ 新しいホストボタンの表示ロジック ★★★
  if (pickingCount > 0) {
    // 1人でも 'picking' (再ピック待ち含む) の人がいれば、ホストは待機
    resolvePhaseButton.classList.add("hidden");
    nextRoundButton.classList.add("hidden");
  } else if (submittedCount > 0) {
    // 'picking' の人がゼロで、かつ 'submitted' の人が1人以上いれば、「解決」ボタンを表示
    resolvePhaseButton.classList.remove("hidden");
    nextRoundButton.classList.add("hidden");
  } else {
    // 'picking' も 'submitted' もゼロ = 全員が 'round_won'
    resolvePhaseButton.classList.add("hidden");
    nextRoundButton.classList.remove("hidden");
  }
}

// (B) カードリストを描画する
function renderCardList() {
  if (!allCardsData ||!availableCardIds) return; // JSONまたはFirestoreのロード前は何もしない
  
  // 現在のスクロール位置を保持
  const scrollPos = cardListElement.scrollTop;
  
  cardListElement.innerHTML = "";
  
  // card_list.json の全カードをループ
  for (const card of allCardsData) {
    // 検索フィルタ 
    const query = cardSearchInput.value.toLowerCase();
    if (query &&!card.name.toLowerCase().includes(query)) {
      continue; // 検索クエリに一致しない場合はスキップ
    }

    const li = document.createElement("li");
    li.textContent = card.name;
    li.dataset.cardId = card.id; // data-card-id 属性にカードIDを保存

    // ★★★【ロジック説明】★★★
    // (これが「問題2」の動作です。これは意図した動作です)
    // Firestore の 'availableCardIds' に含まれていないカードは、
    // 'picked' (獲得済み) としてグレーアウト表示します。
    if (!availableCardIds.includes(card.id)) {
      li.classList.add("picked"); 
    }

    // 自分が選択中かチェック
    if (selectedPick === card.id) {
      li.classList.add("selected");
    }

    // --- カードモーダルのロジック --- [15, 16, 17]
    const modalContent = cardModal.cloneNode(true); // モーダルのDOMを複製
    modalContent.id = ""; // IDが重複しないように
    // (仕様変更後のイラストパス 'imageUrl' を使用)
    modalContent.querySelector("img").src = card.imageUrl; 
    li.appendChild(modalContent); 
    // (CSSの li:hover > #card-modal で表示される)

    cardListElement.appendChild(li);
  }
  
  // スクロール位置を復元
  cardListElement.scrollTop = scrollPos;
}

// (C) 自分の獲得カードリストを描画する
function renderMyPicks(myPicks) {
  myPicksList.innerHTML = "";
  // 獲得順（ラウンド順）にソート
  myPicks.sort((a, b) => a.round - b.round);
  
  for (const pick of myPicks) {
    const li = document.createElement("li");
    li.textContent = `R${pick.round}: ${pick.cardId}`;
    myPicksList.appendChild(li);
  }
}

// (D) アクティビティログを描画する 
function renderActivityLog(logs) {
  activityLogList.innerHTML = "";
  // (startDraftAppのonSnapshot内でソート済み)
  for (const log of logs) {
    const li = document.createElement("li");
    li.textContent = log.text;
    activityLogList.appendChild(li);
  }
  // 自動で一番下にスクロール
  activityLogList.scrollTop = activityLogList.scrollHeight;
}


// ===================================================
// 8. イベントリスナー (ユーザーの操作)
// ===================================================

// (A) ルーム参加ボタンが押された時
joinRoomButton.addEventListener("click", async () => {
  const username = usernameInput.value;
  if (!username) {
    alert("ユーザー名を入力してください");
    return;
  }
  if (!currentUserId) {
    alert("認証エラー。ページをリロードしてください。");
    return;
  }

  // Firestore の participants サブコレクションに自分の情報を書き込む
  const myParticipantRef = doc(db, "rooms", currentRoomId, "participants", currentUserId);
  
  try {
    await setDoc(myParticipantRef, {
      username: username,
      status: "picking", // 最初のステータス
      currentPick: null,
      isConnected: true
    });
    
    // Firestoreへの書き込みが成功したら、アプリのメイン処理を開始
    startDraftApp(currentRoomId, currentUserId, username);

  } catch (error) {
    console.error("ルーム参加に失敗:", error);
  }
});

// (B) カード検索欄に入力された時 
cardSearchInput.addEventListener("input", () => {
  renderCardList(); // 検索するたびにリストを再描画
});

// (C) カードリストの項目がクリックされた時
cardListElement.addEventListener("click", (e) => {
  // クリックされたのが <li> 要素で、かつ 'picked' クラスを持たない場合
  if (e.target.tagName === "LI" &&!e.target.classList.contains("picked")) {
    selectedPick = e.target.dataset.cardId;
    submitPickButton.disabled = false; // 「決定」ボタンを有効化
    renderCardList(); // 選択状態を反映するために再描画
  }
});

// (D) ピック決定ボタンが押された時
submitPickButton.addEventListener("click", async () => {
  if (!selectedPick) return;

  const myParticipantRef = doc(db, "rooms", currentRoomId, "participants", currentUserId);
  try {
    // 自分のステータスを 'submitted' (提出済み) に更新
    await setDoc(myParticipantRef, {
      currentPick: selectedPick,
      status: "submitted"
    }, { merge: true }); // 他のフィールド(usernameなど)はそのまま

    submitPickButton.disabled = true; // 提出したらボタンを無効化
    selectedPick = null;

  } catch (error) {
    console.error("ピックの提出に失敗:", error);
  }
});

// (E) 【ホスト専用】ピック解決ボタンが押された時
resolvePhaseButton.addEventListener("click", async () => {
  console.log("Cloud Function 'resolvePickPhase' を呼び出します...");
  
  // フェーズ3で作成した Cloud Function への参照を取得 [3, 4]
  const resolvePickPhase = httpsCallable(functions, "resolvePickPhase");
  
  try {
    // ★★★【重要】★★★
    // ここで { roomId: currentRoomId } というオブジェクトを
    // 引数として渡す必要があります。
    // （currentRoomId は "main-room" に設定されています）
    const result = await resolvePickPhase({ roomId: currentRoomId }); 
    // ★★★★★★★★★★★★★
    
    console.log("関数実行成功:", result.data);
    
    // (UIの更新は 'onSnapshot' リスナーが自動で行うので、ここでは何もしなくてよい)
    
  } catch (error) {
    console.error("Cloud Function の呼び出しに失敗:", error);
    // (エラーがここで表示されます)
  }
});

// (F) 【ホスト専用】次ラウンドへボタンが押された時
nextRoundButton.addEventListener("click", async () => {
  // (この機能はまだ設計していないため、アラートのみ)
  alert("次ラウンドへ進む処理を実装する必要があります（全員のステータスを'picking'に戻すなど）");
});