# requirements.md（改訂版）

> 本ドキュメントは「ネットスーパー売り場でのピッキング効率計測アプリ」の要件定義である。
> 実装は React Router v7（Framework Mode）を前提とし、データ取得・更新は loader/action/useFetcher を基本とする。

---

## 1. 用語定義

* **店舗（Store）**：計測対象の売り場
* **作業者（Worker）**：ピッキング作業を実施する人（ユーザー単位の認証は行わない）
* **注文（Order）**：注文番号（A + 7桁）をキーとして開始・完了を管理する計測単位

  * 注文番号は重複を許可し、内部的な一意識別は `orders.id` を用いる
* **個別作業（EachPick）**：注文内で SKU（点数）単位に計測した1レコード

  * `sku_count` と複数のタイムスタンプを保持する

---

## 2. 機能要件

### 2.1 技術スタック

* フロント：React Router v7（Framework Mode） / Tailwind CSS
* データ処理：React Router の `loader` / `action` / `useFetcher` を原則とする
* ORM：Drizzle ORM
* DB：

  * dev：SQLite（bun:sqlite）
  * stg：Turso
  * prod：Turso
* デプロイ：Cloud Run
* テーブル表示：TanStack Table（多機能データテーブル）
* 認証：トップページ（`/`）での Basic 認証のみ

  * ユーザー単位のログイン・権限管理は実装しない

### 2.2 ページ要件（概要）

* `/`：トップページ（メニュー）
* `/picking`：ピッキング測定（レイアウト + Outlet）

  * `/picking/register`：測定開始/再開
  * `/picking/pick?order_id=<id>`：SKU単位の記録
* `/dashboard`：ダッシュボード（レイアウト + Outlet）

  * `/dashboard`：検索条件入力（セレクタ）
  * `/dashboard/result?date=<YYYY-MM-DD>&worker=<id|all>&store=<id|all>&from=selector`：結果表示
* `/edit`：マスタ編集（レイアウト + Outlet）

  * `/edit/worker`：作業者CRUD
  * `/edit/store`：店舗CRUD

---

## 3. 非機能要件（設計規約）

* 入力は React Router の `<Form>` を利用し、**値を `useState` で管理しない**（statelessを原則）
* 初期データ取得は `loader` を利用し、`useEffect` による初回 fetch は行わない
* `useState` は **UI状態（モーダル/サイドバー開閉など）** に限定
* 単一stateを複雑に扱う場合は `useReducer` を採用し、reducer関数をテスト可能な形で実装しテストも記述する
* レスポンシブ対応：

  * スマホ：計測（/picking）
  * PC：ダッシュボード閲覧・CSV出力（/dashboard）
* パフォーマンス要件：Cloud Run 無料枠相当で実用に耐える（重い集計は原則フロント側集計で吸収）
* 主キー：

  * UUID は採用しない（クエリ性能低下を避ける）
  * DB主キーは `INTEGER AUTOINCREMENT`（または同等の連番）を利用する
* ディレクトリ構成はコロケーション（関連ファイルをまとめる）で構成する

---

## 4. DB構造（スキーマ）

### 4.1 stores

```ts
{
  id: number; // primary key, autoincrement, unique
  store_name: string;
}
```

### 4.2 workers

```ts
{
  id: number; // primary key, autoincrement, unique
  worker_name: string;
}
```

### 4.3 orders

> ダッシュボードで「作業が存在する日付一覧」を安定して取得するため、JST基準の日付カラムを保持する。

```ts
{
  id: number; // primary key, autoincrement, unique

  store_id: number;  // FK -> stores.id
  worker_id: number; // FK -> workers.id（開始時の作業者）

  order_number: string; // "A" + 7桁（例: "A0123456"）。重複可

  start_time: timestamp;        // 注文開始（ISO保存）
  end_time: timestamp | null;   // 完了時刻（未完了はnull）
  is_completed: boolean;        // 完了フラグ

  work_date: string;            // "YYYY-MM-DD"（JST基準、例: "2026-01-16"）
}
```

#### work_date の保存ポリシー

* `orders` 作成時（`/picking/register` の create action）に、押下時刻を **JST基準**で日付化し `work_date` に保存する
* ダッシュボードの日付セレクタは `orders.work_date` を `DISTINCT` して作成する
* これにより Turso（libSQL）/ SQLite（bun:sqlite）間で日時関数差分を避ける

#### 推奨インデックス

* `orders(work_date)`
* （必要に応じて）`orders(work_date, store_id)` / `orders(work_date, worker_id)` の複合インデックス


### 4.4 each_picks

```ts
{
  id: number; // primary key, autoincrement, unique

  order_id: number;  // FK -> orders.id
  worker_id: number; // FK -> workers.id（引き継ぎ対応：各レコードで保持）

  sku_count: number; // >= 1

  move_start: timestamp | null;
  arrive_at_shelf: timestamp | null;
  pick_start: timestamp | null;
  pack_start: timestamp | null;
  pack_finished: timestamp | null;

  customer_service_start: timestamp | null;
  customer_service_finish: timestamp | null;
}
```

> ポリシー：必須入力項目は作らない。各timestampは null 許容とする。

---

## 5. アプリケーション要件（詳細）

## 5.1 トップページ `/`

* 画面要素

  * 各ページへのリンク

    * `/picking/register`
    * `/dashboard`
    * `/edit`

---

## 5.2 ピッキング測定 `/picking`

* ベースレイアウトのみを提供し、配下は `<Outlet />` で表示制御する

### 5.2.1 測定開始/再開 `/picking/register`

目的：作業者と注文番号を登録し、計測を開始する。未完了注文がある場合は再開できる。
UI：スマートフォンを基本としたレイアウト。

#### 画面要素

* 店舗選択

  * `stores` を `loader` で取得し選択可能
* 作業者選択

  * `workers` を `loader` で取得し選択可能
* 注文番号入力

  * 数字7桁のみ入力させる（先頭の "A" は固定）
  * DBには `"A" + digits7` を `order_number` として `string` 登録する
  * 既存注文との重複チェックは行わない
* 作業開始ボタン

  * `action` で `orders` を作成し `start_time` を押下時刻で保存
  * 作成した `orders.id` を用いて `/picking/pick?order_id=<id>` に遷移する
* 途中作業リスト

  * `is_completed=false` の注文を一覧表示（表示は注文番号 + 作業者名 + 店舗名）
* 作業再開ボタン

  * 途中作業リストから対象注文を選択し、`/picking/pick?order_id=<id>` に遷移する

---

### 5.2.2 ピッキング登録 `/picking/pick?order_id=<id>`

目的：注文内のSKU単位作業を、タイムスタンプとして記録する。
UI：スマートフォンを基本としたレイアウト。

#### 実装原則

* 入力値は **React Router の `<Form>`** で送信する
* **入力値を state で保持しない**（例：timestampも hidden input に書き込む）

#### 画面要素

* 店舗名：`loader` で注文に紐づく店舗を取得し表示（変更不可）

* 注文番号：`loader` で表示（変更不可）

* 作業者選択：

  * デフォルトは `orders.worker_id`
  * 引き継ぎの可能性があるため、`workers` 一覧から変更可能

* 商品点数：

  * デフォルト 1
  * 最小値 1 の int

* タイムスタンプ記録ボタン（押下でinputに現在時刻を書き込む。再押下で上書き）

  * 移動開始（move_start）
  * 棚前到着（arrive_at_shelf）
  * ピック開始（pick_start）
  * 梱包開始（pack_start）
  * 梱包完了（pack_finished）

    * 押下で確認モーダルを表示し、確定で `each_picks` を作成（action）
    * 登録成功後のUI更新：

      * 全timestamp入力をクリア
      * 商品点数を1へ戻す
      * かつ「移動開始」入力には **登録確定時刻** を初期値として再セットする
  * お客さま対応開始（customer_service_start）
  * お客さま対応終了（customer_service_finish）

    * お客さま対応系ボタンは、他ボタンと色を変えて区別する

* 完了ボタン（注文完了）

  * 確認モーダルを表示し、確定で `orders` を更新

    * `end_time` に押下時刻を保存
    * `is_completed=true`
  * 完了後は `/picking/register` に redirect

---

## 5.3 ダッシュボード `/dashboard`

目的：日次の計測結果を検索・集計・可視化・CSV出力する。
UI：PC利用を主としつつレスポンシブ対応。

### 5.3.1 検索画面 `/dashboard`

* 日付選択

  * `loader` で「作業が存在する日付一覧」を取得し、その中から選択可能にする
* 作業者選択

  * `loader` で `workers` を取得
  * デフォルトは `all`（全作業者）
* 店舗選択

  * `loader` で `stores` を取得
  * デフォルトは `all`（全店舗）
* 検索ボタン

  * `/dashboard/result?date=<YYYY-MM-DD>&worker=<id|all>&store=<id|all>&from=selector` に redirect する

### 5.3.2 結果画面 `/dashboard/result`

#### 直アクセス制限

* `from=selector` クエリが無いアクセスは禁止
* `DashboardResultLoader` は `redirect("/dashboard?error=direct_access")` を返す
* `/dashboard` は `error=direct_access` を検知した場合に "検索画面から入力してください" を alert/toast 表示する

#### データ取得

* `loader` でクエリに一致するデータを取得し、`useLoaderData()` で保持する
* 取得データは **個別作業単位（each_picks）** を基本とし、次の項目を含む配列とする

```csv
"店舗名","作業者名","注文番号","商品点数","作業開始","作業終了","移動開始","棚前到着","ピック開始","梱包開始","梱包完了","お客さま対応開始","お客さま対応終了"
```

> ここでの「作業開始/終了」は orders.start_time / orders.end_time を指す。

#### 表示・集計の方針

* 画面状態は `displayFormat` のみ state として保持する

  * `aggregationUnit`: "order" | "worker" | "each_pick"
  * `viewMode`: "table" | "bar"
* `loaderData` は state にコピーせず、表示のたびに `displayFormat` に基づいて計算する
* `displayFormat` の更新ロジックは `useReducer` で実装し、reducerのテストを記述する

#### UI要素

* 集計形式選択（デフォルト：注文単位）

  * 注文単位 / 作業者単位 / 個別作業単位
* 表示形式選択（デフォルト：テーブル）

  * テーブル / 棒グラフ
* CSV出力ボタン

  * 現在の集計・表示対象に合わせて CSV を生成しダウンロード
  * Excelでの集計を想定し、タイムスタンプは解釈可能な形式（ISO推奨）で出力する

#### 集計仕様

* **ピッキングレート**：`合計商品点数 / 作業時間(時間)`

  * 作業時間は `end_time - start_time`（秒→時間換算）
  * `end_time` が null の注文は結果から除外（または `is_completed=true` のみに限定）

1. 注文単位（orders.idで集計）

* テーブル：

  * 店舗名 / 注文番号 / 作業者名（開始時） / 合計商品点数 / 全作業時間 / ピッキングレート
* 棒グラフ：

  * 横軸：合計商品点数
  * 縦軸：ピッキングレート
  * ホバー：店舗名、注文番号、作業者名、全作業時間

2. 作業者単位（workers.idで集計）

* テーブル：

  * 店舗名 / 作業者名（開始時） / 処理注文数（集計した orders.id の数） / 合計商品点数 / 全作業時間 / ピッキングレート
* 棒グラフ：

  * 横軸：作業者名
  * 縦軸：ピッキングレート
  * ホバー：店舗名、処理注文数、全作業時間、合計商品点数

3. 個別作業単位（each_picksをそのまま表示）

* テーブル：

  * 店舗名 / 注文番号 / 作業者名（each_picks.worker_id） / 商品点数 / 作業開始 / 作業終了 / 各timestamp / ピッキングレート
* 棒グラフ：

  * "個別作業単位はグラフ表示に対応していません" と表示

---

## 5.4 編集 `/edit`

目的：マスタデータ（店舗/作業者）をCRUDする。
UI：PC利用を主としつつレスポンシブ対応。

* `/edit` はレイアウト + `<Outlet />`
* `/edit/worker`：作業者CRUD
* `/edit/store`：店舗CRUD

## 6. ルート別：loader / action / DTO 仕様（B）

> 原則：データ取得は loader、更新は action。フォーム送信・局所更新は useFetcher を利用する。
> 入出力は「画面が必要とする最小限」を返し、フロントで追加計算する。

---

## 6.1 `/`（トップ）

### loader

* 役割：トップページリンク表示のみ。データ不要。
* Response：`null`

### action

* なし（Basic認証はミドルウェア/Cloud Run側設定で実施）

---

## 6.2 `/picking/register`（測定開始・再開）

### loader: PickingRegisterLoader

* 取得するもの

  * 店舗一覧
  * 作業者一覧
  * 未完了注文一覧（途中作業リスト）

#### Response DTO

```ts
type PickingRegisterLoaderData = {
  stores: { id: number; store_name: string }[];
  workers: { id: number; worker_name: string }[];
  inProgressOrders: {
    id: number;                 // orders.id
    order_number: string;        // "A0123456"
    store: { id: number; store_name: string };
    worker: { id: number; worker_name: string };
    start_time: string;          // ISO
  }[];
};
```

### action（2種類）：create / resume

* `<Form method="post">` で `_intent` を送る

#### Request（共通）

```ts
type PickingRegisterActionIntent = "create" | "resume";
```

#### action: create（注文作成して開始）

* Request Form fields

  * `_intent` = "create"
  * `store_id`: string（numberに変換）
  * `worker_id`: string（numberに変換）
  * `order_digits7`: string（7桁数字）
* Validation

  * `store_id` / `worker_id` は存在チェック
  * `order_digits7` は `/^\d{7}$/`
* Side effects（DB）

  * orders を作成

    * `store_id`, `worker_id`
    * `order_number` = `"A" + order_digits7`
    * `start_time` = now
    * `end_time` = null
    * `is_completed` = false
* Success

  * redirect: `/picking/pick?order_id=<createdId>`
* Error Response（validation失敗）

```ts
type PickingRegisterActionError = {
  ok: false;
  fieldErrors?: Partial<Record<"store_id"|"worker_id"|"order_digits7", string>>;
  formError?: string;
};
```

#### action: resume（途中作業再開）

* Request Form fields

  * `_intent` = "resume"
  * `order_id`: string（numberに変換）
* Validation

  * `order_id` が存在し、`is_completed=false` であること
* Success

  * redirect: `/picking/pick?order_id=<order_id>`
* Error Response（validation失敗）：createと同形式（formError中心）

---

## 6.3 `/picking/pick?order_id=<id>`（SKU単位の記録）

### loader: PickingPickLoader

* 取得するもの

  * 注文（店舗/注文番号/開始時作業者）
  * 店舗（表示用）
  * 作業者一覧（引き継ぎ用）
  * 直近の作業記録（任意：UIで履歴表示する場合のみ）

#### Request（Query）

```ts
type PickingPickQuery = { order_id: string }; // numberに変換
```

#### Response DTO

```ts
type PickingPickLoaderData = {
  order: {
    id: number;
    order_number: string;
    start_time: string;          // ISO
    end_time: string | null;     // ISO | null
    is_completed: boolean;
    store: { id: number; store_name: string };
    worker: { id: number; worker_name: string }; // 開始時作業者
  };
  workers: { id: number; worker_name: string }[];
  // 任意（履歴表示を入れる場合）
  recentEachPicks?: {
    id: number;
    worker: { id: number; worker_name: string };
    sku_count: number;
    move_start: string | null;
    arrive_at_shelf: string | null;
    pick_start: string | null;
    pack_start: string | null;
    pack_finished: string | null;
    customer_service_start: string | null;
    customer_service_finish: string | null;
  }[];
};
```

### action（2種類）：save_each_pick / complete_order

* `_intent` を送る

#### action: save_each_pick（梱包完了＝個別作業レコード登録）

* Request Form fields

  * `_intent` = "save_each_pick"
  * `order_id`: string（number）
  * `worker_id`: string（number）
  * `sku_count`: string（number）
  * `move_start`: string | ""（ISO or empty）
  * `arrive_at_shelf`: string | ""
  * `pick_start`: string | ""
  * `pack_start`: string | ""
  * `pack_finished`: string（ISO必須：確定操作時に必ず入る）
  * `customer_service_start`: string | ""
  * `customer_service_finish`: string | ""
* Validation

  * `order_id` が存在し `is_completed=false`
  * `worker_id` が存在
  * `sku_count` は `>=1`
  * timestampは空文字なら null、入っているならISOとしてparse可能
  * 追加の順序整合（例：move_start <= pack_finished）は **強制しない**（運用優先）
* Side effects（DB）

  * each_picks を insert（空はnull）
* Success

  * 200 OK（fetcher利用前提でredirectしない）

```ts
type SaveEachPickActionResult =
  | { ok: true; created_each_pick_id: number }
  | { ok: false; fieldErrors?: Record<string,string>; formError?: string };
```

#### action: complete_order（注文完了）

* Request Form fields

  * `_intent` = "complete_order"
  * `order_id`: string（number）
* Validation

  * `order_id` が存在し `is_completed=false`
* Side effects（DB）

  * orders を update

    * `end_time` = now
    * `is_completed` = true
* Success

  * redirect: `/picking/register`
* Error Response

  * `{ ok:false, formError:"..." }`

---

## 6.4 `/dashboard`（検索条件入力）

### loader: DashboardSelectorLoader

* 取得するもの

  * 作業が存在する日付一覧（YYYY-MM-DD）
  * 店舗一覧
  * 作業者一覧

#### Response DTO

```ts
type DashboardSelectorLoaderData = {
  availableDates: string[]; // "YYYY-MM-DD"（作業存在日）
  stores: { id: number; store_name: string }[];
  workers: { id: number; worker_name: string }[];
};
```

### action

* 実装方針：`<Form method="get" action="/dashboard/result">` を推奨

  * これにより action は不要（stateless）
* 付与するクエリ

  * `date`, `worker`, `store`, `from=selector`

---

## 6.5 `/dashboard/result?date=...`（結果表示）

### loader: DashboardResultLoader

* 直アクセス制限

  * `from !== "selector"` の場合：

    * 303 redirect `/dashboard`（可能ならフラッシュ/ヘッダでメッセージ）
* Query parameters

  * `date`: "YYYY-MM-DD"（必須）
  * `worker`: "all" | "<id>"
  * `store`: "all" | "<id>"
  * `from`: "selector"（必須）

#### Response DTO（個別作業ベースのフラット配列）

```ts
type DashboardRow = {
  store_name: string;
  worker_name: string;     // each_picks.worker_id の名前
  order_number: string;

  sku_count: number;

  order_start_time: string; // orders.start_time ISO
  order_end_time: string;   // orders.end_time ISO（完了のみ対象にするなら必須）
  move_start: string | null;
  arrive_at_shelf: string | null;
  pick_start: string | null;
  pack_start: string | null;
  pack_finished: string | null;
  customer_service_start: string | null;
  customer_service_finish: string | null;

  order_id: number;         // 集計用（orders.id）
  order_worker_name: string;// 開始時作業者（注文単位集計で使用）
};

type DashboardResultLoaderData = {
  query: { date: string; worker: "all"|number; store: "all"|number };
  rows: DashboardRow[];
};
```

> 注：CSV出力もこの rows を元にフロントで集計して生成する（loaderで集計済みを返さない）

### action

* 不要（CSVはフロント生成、表示切替は reducer）

---

## 6.6 `/edit/worker`（作業者CRUD）

### loader: WorkersLoader

```ts
type WorkersLoaderData = {
  workers: { id: number; worker_name: string }[];
};
```

### action（_intentで分岐）

* create

  * fields: `_intent="create"`, `worker_name`
* update

  * fields: `_intent="update"`, `id`, `worker_name`
* delete

  * fields: `_intent="delete"`, `id`

#### 共通 Response

```ts
type EditActionResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string,string>; formError?: string };
```

---

## 6.7 `/edit/store`（店舗CRUD）

### loader: StoresLoader

```ts
type StoresLoaderData = {
  stores: { id: number; store_name: string }[];
};
```

### action（_intentで分岐）

* create

  * fields: `_intent="create"`, `store_name`
* update

  * fields: `_intent="update"`, `id`, `store_name`
* delete

  * fields: `_intent="delete"`, `id`

#### 共通 Response

* EditActionResult と同一

---

## 6.x ダッシュボード：作業が存在する日付一覧の取得仕様（Turso/SQLite差分最小）

### 目的

`/dashboard` の loader で、作業が存在する日付一覧 `availableDates: string[] ("YYYY-MM-DD")` を取得する。

### 取得対象

* `orders` を対象とする（注文が存在すれば作業が存在するとみなす）

### 取得クエリ（共通：Turso/SQLite）

```sql
SELECT DISTINCT work_date
FROM orders
ORDER BY work_date DESC;
```

### 取得クエリ（任意：store/worker で絞り込みを将来入れる場合）

```sql
SELECT DISTINCT work_date
FROM orders
WHERE (?1 IS NULL OR store_id = ?1)
  AND (?2 IS NULL OR worker_id = ?2)
ORDER BY work_date DESC;
```

---

## 6.y 既存データの backfill 手順（work_date 追加後）

> 既存の orders 行に対して work_date を埋める。
> start_time を UTC で保存している前提で、JST = UTC+9 として日付化する（JSTはDSTがないため運用上安全）。

### backfill SQL（Turso/SQLite 共通）

```sql
UPDATE orders
SET work_date = date(start_time, '+9 hours')
WHERE work_date IS NULL OR work_date = '';
```

### backfill 実行後の確認

```sql
SELECT work_date, COUNT(*) AS cnt
FROM orders
GROUP BY work_date
ORDER BY work_date DESC;
```
