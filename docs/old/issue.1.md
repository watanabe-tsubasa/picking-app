# issue.1.md

## 梱包完了押下後の挙動

梱包完了のボタンを押下後、移動開始に1秒ごとに継続的にタイムスタンプが書き込まれる挙動をとっている

### 参考

```ts
if (fetcher.data?.ok && fetcher.state === "idle") {
  setTimeout(() => { setTimestamps(...); setSkuCount(1); }, 0);
}
```

```ts
const orderId = order.id; // loader由来を使う

useEffect(() => {
  if (!fetcher.data?.ok) return;
  if (fetcher.state !== "idle") return;

  const now = new Date().toISOString();
  setTimestamps({
    move_start: now,
    arrive_at_shelf: "",
    pick_start: "",
    pack_start: "",
    pack_finished: "",
    customer_service_start: "",
    customer_service_finish: "",
  });
  setSkuCount(1);
}, [fetcher.data, fetcher.state]);
```

## ピッキング測定画面 `/picking/pick`の縦幅

スクロールが発生しないように、縦幅を画面幅と合わせてください。
'/app/routes/picking/pick.tsx'を私の方で多少調整していますので、そのレイアウトを活かして縦幅を合わせてください。

## dashboardのテーブル

@tanstack/react-tableに変更してください。ライブラリはこちらで入れています

## dashboardの棒グラフ

注文単位の方は、商品点数の値のグラフを表示しないでください。

## デザイン

全体的にちょっとカラフルすぎるので、黒とグレー、白を基調としたVercelっぽいデザインに変更してください