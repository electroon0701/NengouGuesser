# NengouGuesser
年号を覚えるためのゲームです。`index.html` がゲームの入口です。

## ストーリーモードのファイル

- `story/data/` — 世界・地域・ステージ設定、NPC設定、シナリオプログラムJSON
- `story/studio/` — 地図編集、人物編集、シナリオ作成のHTML
- `story/assets/` — 幣殿背景、世界地図、地域地図などの画像
- `story/assets/regions/` — 地域別マップ画像の置き場所
- `docs/story/` — ストーリーモード仕様・更新履歴・操作マニュアル
- `docs/CPU_IMPLEMENTATION.txt` — CPUの実装メモ

## 編集を始める

シナリオ系HTMLは、JSONや画像を読み込めるよう、プロジェクトのルートからHTTPで開いてください。操作方法、書き出したJSONの配置、GitHub Pagesへの反映、Firebase Google連携は [`docs/story/シナリオ作成マニュアル.md`](docs/story/シナリオ作成マニュアル.md) にまとめています。

## 世界地図・地域マップ

`story/data/story-world.json` が地域とステージの基準データです。世界地図画像と各地域の地図画像はプロジェクト内の画像パスで指定できます。地図・ステージの編集HTMLは [`story/studio/story-world-studio.html`](story/studio/story-world-studio.html) です。添付された世界地図画像を `story/assets/ancient-world-map.jpeg` として登録済みです。

## Firebase

ストーリーの基本画面は端末内で動作します。Google連携・別端末復元・手動クラウド保存を使う場合のみFirebaseへ接続します。無料プラン内で通信を抑えるため、進行保存はボタン操作時だけです。Firebase Consoleで必要な設定とDatabase Rulesの公開手順は操作マニュアルを参照してください。

## 今回の拡張（2026-11-15）

- 幣殿を独立したステージ画面として追加（既存の拠点画面から移動）。
- 世界地図に古代・中世・近世・近代・最近世・現代の時代切替と、暗黒地図「廻間」への入口を追加。
- 戦闘ロビーに「地域」フィルターを追加。問題データの `region` が未入力の場合は「不定」として扱います。
- `questions.json` の既存問題には `region: "不定"` を補完。
- `csv_to_json.html` はCSVの任意列 `region` を読み込み、未入力時に「不定」をJSONへ出力します。

時代別マップの地域ピン・地域別ステージは、該当時代の `story/data/story-world.json` の `regions` にデータを追加すると表示されます。現在登録済みの地域データは古代のみです。ほかの時代の地図は共通の模式世界図を基盤に表示し、地域データの追加待ちとして案内します。
