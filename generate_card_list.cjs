const fs = require('fs');
const path = require('path');

// ----------------------------------------------------
// ご自身の環境に合わせて、以下のパスを修正してください
// ----------------------------------------------------

// 「カード名_transparent.png」ファイルが保存されているディレクトリパス
// （例: './public/images/illustrations' や 'C:/Users/knaze/Documents/GitHub/AnokoroDraft/public/images/illustrations' など）
const illustDir = './images/illustrations'; 

// 出力する JSON ファイルのパスと名前
// （例: './public/data/card_list.json'）
const outputJsonPath = './public/data/card_list.json';

// ----------------------------------------------------

// 空の配列を正しく初期化します
const cardData =[];

try {
  // illustDir ディレクトリからファイル名を読み込みます
  const files = fs.readdirSync(illustDir);

  files.forEach(file => {
    //「_transparent.png」で終わるファイルのみを対象にします
    if (file.endsWith('_transparent.png')) {
      
      // 拡張子「_transparent.png」を取り除いてカード名を取得します
      const cardName = file.replace('_transparent.png', '');
      
      // JSON オブジェクトを作成し、配列 (cardData) に追加 (push) します
      cardData.push({
        id: cardName, // カード名自体をユニークIDとして使用
        name: cardName,
        imageUrl: `/images/illustrations/${file}` // Webサイト上で読み込むパス (illustDirの/public/以降のパス)
      });
    }
  });

  // cardData 配列を JSON 形式の文字列に変換してファイルに書き出します
  // 注意: outputJsonPath のディレクトリ（この例では./public/data）が事前に存在する必要があります
  fs.writeFileSync(outputJsonPath, JSON.stringify(cardData, null, 2));
  
  console.log(`Successfully generated ${outputJsonPath} with ${cardData.length} cards.`);

} catch (err) {
  console.error('Error reading directory or writing file:', err);
  
  // エラーヒント
  if (err.code === 'ENOENT') {
    console.error(`\n[エラーのヒント]`);
    console.error(`指定されたディレクトリが見つかりません。`);
    console.error(`スクリプト内の 'illustDir' のパス (現在値: "${illustDir}") が正しいか確認してください。`);
    console.error(`スクリプトを実行する場所（カレントディレクトリ）が正しいかも確認してください。`);
  }
}