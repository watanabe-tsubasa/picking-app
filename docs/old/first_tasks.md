# tasks

## step.0 preparation

[x] Drizzle ORM セットアップ（drizzle.config.ts, db接続設定）
[x] DBスキーマ定義（stores, workers, orders, each_picks）
[x] マイグレーション実行・シードデータ投入スクリプト
[x] 共通レイアウトコンポーネント作成

## step.1 トップページ `/`

[x] トップページ実装（メニューリンク: /picking/register, /dashboard, /edit）

## step.2 マスタ編集 `/edit`

[x] /edit レイアウト（Outlet）
[x] /edit/store 店舗CRUD（loader/action）
[x] /edit/worker 作業者CRUD（loader/action）

## step.3 ピッキング測定 `/picking`

[x] /picking レイアウト（Outlet、モバイルファースト）
[x] /picking/register 測定開始・再開（loader: stores/workers/未完了注文、action: create/resume）
[x] /picking/pick?order_id= SKU単位記録（loader: 注文情報/作業者一覧、action: save_each_pick/complete_order）
[x] タイムスタンプボタンUI（hidden inputへの時刻書き込み、確認モーダル）

## step.4 ダッシュボード `/dashboard`

[x] /dashboard レイアウト（Outlet、PCファースト）
[x] /dashboard 検索画面（loader: availableDates/stores/workers、Form method="get"）
[x] /dashboard/result 結果表示（loader: 直アクセス制限、each_picksベースのデータ取得）
[x] displayFormat reducer（aggregationUnit/viewMode切替、テスト記述）
[x] 集計ロジック（注文単位/作業者単位/個別作業単位）
[x] テーブル表示（標準HTML table使用）
[x] CSV出力機能

## step.5 仕上げ

[x] 全ルートの型チェック確認
[x] レスポンシブ調整（/picking: モバイル、/dashboard: PC）
[x] エラーハンドリング・バリデーション確認
