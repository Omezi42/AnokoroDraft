// functions/index.js

// 必要なライブラリをインポートします
const functions = require("firebase-functions"); // Firebase Functions の本体
const admin = require("firebase-admin"); // Firebase の管理者用 SDK

// A helper function to initialize admin ONLY ONCE
function initializeAdmin() {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * ドラフトのピックフェーズを解決する「呼び出し可能な関数 (Callable Function)」
 */
exports.resolvePickPhase = functions.https.onCall(async (data, context) => {
  // Initialize admin and get DB *inside* the function call.
  const db = initializeAdmin();

  // (デバッグ用に認証チェックはコメントアウトしたままにします)
  /*
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "この関数は認証されたユーザーのみが呼び出せます。"
    );
  }
  */

  const { roomId } = data; // クライアントから渡された roomId を取得
  if (!roomId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "roomId が必要です。"
    );
  }

  // 2. トランザクションの実行 [1, 2, 3]
  try {
    const transactionResult = await db.runTransaction(async (transaction) => {
      // --- トランザクション (Readフェーズ) ---
      const roomRef = db.collection("rooms").doc(roomId);
      const roomSnap = await transaction.get(roomRef);

      if (!roomSnap.exists) {
        throw new functions.https.HttpsError("not-found", "ルームが見つかりません。");
      }

      let availableCardIds = roomSnap.data().availableCardIds;
      
      // ★★★【バグ修正 1/5】★★★
      // ビット演算子 | ではなく、論理OR || を使用し、一行にまとめます
      const currentRound = roomSnap.data().currentRound || 1;
      // ★★★★★★★★★★★★★★★★

      const participantsRef = roomRef.collection("participants");
      const submittedSnap = await transaction.get(
        participantsRef.where("status", "==", "submitted")
      );

      if (submittedSnap.empty) {
        // 解決対象がいない場合は、何もせず正常終了
        console.log("解決対象のピック ('submitted') がありません。");
        return { message: "解決対象のピックがありません。" };
      }

      console.log(`解決対象のピックが ${submittedSnap.size} 件見つかりました。`);

      // --- トランザクション (Logicフェーズ) ---
      const picks = new Map();
      submittedSnap.docs.forEach((doc) => {
        const userId = doc.id;
        const pick = doc.data().currentPick;
        if (!picks.has(pick)) {
          // ★★★【バグ修正 2/5】★★★
          // ; ではなく、空の配列 を代入
          picks.set(pick,);
        }
        picks.get(pick).push(userId);
      });

      // ★★★【バグ修正 3/5】★★★
      // ; ではなく、空の配列 を代入
      const newLogs =[]; // このフェーズで発生したログ
      
      // ★★★【バグ修正 4/5】★★★
      // ; ではなく、空の配列 を代入
      let cardsToRemove =[]; // このフェーズで獲得が確定したカード

      const userRefsToGet = new Set(submittedSnap.docs.map((doc) => doc.id));
      const userDocs = new Map();
      const userSnapshots = await transaction.get(
        Array.from(userRefsToGet).map((userId) => participantsRef.doc(userId))
      );
      userSnapshots.forEach((doc) => userDocs.set(doc.id, doc.data()));

      // 3. 全てのピックを判定
      for (const [cardId, userIds] of picks.entries()) {
        
        // ★★★【バグ修正 5/5】★★★
        // | | という無効な構文ではなく、 || を使用し、一行にまとめます
        const usernames = userIds.map(
          (id) => userDocs.get(id)?.username || id
        );
        // ★★★★★★★★★★★★★★★★

        if (availableCardIds.includes(cardId)) {
          if (userIds.length === 1) {
            // 3b. 競合なし (単独指名) [4]
            const userId = userIds;
            const userRef = participantsRef.doc(userId);

            transaction.update(userRef, {
              status: "round_won",
              currentPick: null,
            });
            transaction.create(roomRef.collection("draftPicks").doc(), {
              round: currentRound,
              userId: userId,
              cardId: cardId,
              status: "won",
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            newLogs.push(`${usernames} が ${cardId} を獲得しました。`);
            cardsToRemove.push(cardId);
          } else {
            // 3c. 競合あり (複数指名)
            newLogs.push(
              `${cardId} で ${usernames.join(" と ")} が競合。抽選...`
            );
            const winnerIndex = Math.floor(Math.random() * userIds.length); // [5]

            for (let i = 0; i < userIds.length; i++) {
              const userId = userIds[i];
              const userRef = participantsRef.doc(userId);
              if (i === winnerIndex) {
                // 勝者
                transaction.update(userRef, {
                  status: "round_won",
                  currentPick: null,
                });
                transaction.create(roomRef.collection("draftPicks").doc(), {
                  round: currentRound,
                  userId: userId,
                  cardId: cardId,
                  status: "won",
                  timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
                newLogs.push(
                  `...${usernames[i]} が ${cardId} を獲得しました！`
                );
                cardsToRemove.push(cardId);
              } else {
                // 敗者 (再ピック)
                transaction.update(userRef, {
                  status: "picking",
                  currentPick: null,
                });
                newLogs.push(`...${usernames[i]} は再ピックが必要です。`);
              }
            }
          }
        } else {
          // 3d. 無効なピック (カードが既にない)
          newLogs.push(`${cardId} は既に獲得済みです。`);
          for (let i = 0; i < userIds.length; i++) {
            const userId = userIds[i];
            const userRef = participantsRef.doc(userId);
            transaction.update(userRef, {
              status: "picking",
              currentPick: null,
            });
            newLogs.push(`...${usernames[i]} は再ピックが必要です。`);
          }
        }
      } // --- ピック判定ループ終了 ---

      // --- トランザクション (Writeフェーズ) ---
      const logRef = roomRef.collection("draftLog");
      for (const logText of newLogs) {
        transaction.create(logRef.doc(), {
          text: logText,
          type: "system",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const newAvailableCards = availableCardIds.filter(
        (id) =>!cardsToRemove.includes(id)
      );
      transaction.update(roomRef, {
        availableCardIds: newAvailableCards,
        status: "drafting",
      });

      console.log("ピック解決処理が正常に完了。");
      return { success: true, logs: newLogs };
    }); // --- トランザクション終了 ---

    return transactionResult;
  } catch (error) {
    console.error("resolvePickPhase トランザクション失敗:", error);
    throw new functions.https.HttpsError(
      "internal",
      "ピックの解決に失敗しました。",
      error.message
    );
  }
});