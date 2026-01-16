# tasks.1.md - Issue修正タスク

## issue.1 梱包完了押下後の挙動バグ

[x] fetcher.data?.ok 判定によるタイムスタンプリセットの無限ループを修正
[x] useEffectで適切にリセット処理を実装（依存配列の見直し）

## issue.2 ピッキング測定画面の縦幅

[x] /picking/pick の縦幅を画面幅に合わせる（スクロールなし）
[x] 既存レイアウトを活かした調整

## issue.3 dashboardのテーブル

[x] @tanstack/react-table をインストール確認
[x] /dashboard/result のテーブルをTanStack Tableに変更

## issue.4 dashboardの棒グラフ

[x] 注文単位の棒グラフから商品点数(total_sku)のバーを削除

## issue.5 デザイン変更

[x] Vercelライクなデザインに変更（黒・グレー・白基調）
[x] 各ルートのヘッダー・ボタン等のカラー調整
