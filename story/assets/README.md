# ストーリー画像の配置ルール

GitHub Pagesでの画像読み込みを安定させるため、ストーリー用画像は用途ごとに3フォルダへ分けます。

- `maps/` — 世界地図・地域地図・ステージ地図
- `backgrounds/` — ノベル背景・戦闘背景・ホーム背景など
- `portraits/` — 立ち絵・表情差分・チャット用アイコン

## ファイル名

GitHub Pagesでは大文字・小文字が区別されるため、**ファイル名とJSONに記載するパスを完全一致**させてください。
拡張子も小文字（`.png`, `.jpg`, `.jpeg` など）に統一します。

例：

```text
story/assets/maps/world-map.png
story/assets/maps/area_china.png
story/assets/backgrounds/camp.png
story/assets/backgrounds/hospital-room.jpg
story/assets/portraits/yuiga_basic.png
story/assets/portraits/yuiga_surprise.png
```

新しい画像を追加した場合は、Studioで指定するパスも同じフォルダを使用してください。

本編には画像のプリロード・リトライ・キャッシュ処理を搭載しており、ノベルの場面転換時には次の場面で必要な画像を先読みします。
