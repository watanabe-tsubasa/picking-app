import { useState, useRef, useEffect } from "react";
import {
  Form,
  useLoaderData,
  useFetcher,
  redirect,
  useSearchParams,
} from "react-router";
import { eq } from "drizzle-orm";
import { db, stores, workers, orders, eachPicks } from "~/db";
import type { Route } from "./+types/pick";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("order_id"));

  if (!orderId) {
    return redirect("/picking/register");
  }

  const [orderData, allWorkers] = await Promise.all([
    db
      .select({
        id: orders.id,
        order_number: orders.order_number,
        start_time: orders.start_time,
        end_time: orders.end_time,
        is_completed: orders.is_completed,
        store_id: orders.store_id,
        store_name: stores.store_name,
        worker_id: orders.worker_id,
        worker_name: workers.worker_name,
      })
      .from(orders)
      .leftJoin(stores, eq(orders.store_id, stores.id))
      .leftJoin(workers, eq(orders.worker_id, workers.id))
      .where(eq(orders.id, orderId))
      .limit(1),
    db.select().from(workers).orderBy(workers.id),
  ]);

  if (!orderData.length) {
    return redirect("/picking/register");
  }

  const order = orderData[0];
  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      start_time: order.start_time,
      end_time: order.end_time,
      is_completed: order.is_completed,
      store: { id: order.store_id, store_name: order.store_name || "" },
      worker: { id: order.worker_id, worker_name: order.worker_name || "" },
    },
    workers: allWorkers,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "save_each_pick") {
    const orderId = Number(formData.get("order_id"));
    const workerId = Number(formData.get("worker_id"));
    const skuCount = Number(formData.get("sku_count"));

    if (!orderId || !workerId || skuCount < 1) {
      return { ok: false, formError: "入力が不正です" };
    }

    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order.length || order[0].is_completed) {
      return { ok: false, formError: "有効な未完了注文が見つかりません" };
    }

    const getTimestamp = (name: string) => {
      const val = formData.get(name);
      return val && typeof val === "string" && val.trim() ? val : null;
    };

    const result = await db
      .insert(eachPicks)
      .values({
        order_id: orderId,
        worker_id: workerId,
        sku_count: skuCount,
        move_start: getTimestamp("move_start"),
        arrive_at_shelf: getTimestamp("arrive_at_shelf"),
        pick_start: getTimestamp("pick_start"),
        pack_start: getTimestamp("pack_start"),
        pack_finished: getTimestamp("pack_finished"),
        customer_service_start: getTimestamp("customer_service_start"),
        customer_service_finish: getTimestamp("customer_service_finish"),
      })
      .returning({ id: eachPicks.id });

    return { ok: true, created_each_pick_id: result[0].id };
  }

  if (intent === "complete_order") {
    const orderId = Number(formData.get("order_id"));

    if (!orderId) {
      return { ok: false, formError: "注文IDが不正です" };
    }

    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order.length || order[0].is_completed) {
      return { ok: false, formError: "有効な未完了注文が見つかりません" };
    }

    await db
      .update(orders)
      .set({
        end_time: new Date().toISOString(),
        is_completed: true,
      })
      .where(eq(orders.id, orderId));

    return redirect("/picking/register");
  }

  return { ok: false, formError: "不明な操作です" };
}

type TimestampField =
  | "move_start"
  | "arrive_at_shelf"
  | "pick_start"
  | "pack_start"
  | "pack_finished"
  | "customer_service_start"
  | "customer_service_finish";

const TIMESTAMP_BUTTONS: { name: TimestampField; label: string; isCustomerService?: boolean }[] = [
  { name: "move_start", label: "移動開始" },
  { name: "arrive_at_shelf", label: "棚前到着" },
  { name: "pick_start", label: "ピック開始" },
  { name: "pack_start", label: "梱包開始" },
  { name: "pack_finished", label: "梱包完了" },
  { name: "customer_service_start", label: "お客さま対応開始", isCustomerService: true },
  { name: "customer_service_finish", label: "お客さま対応終了", isCustomerService: true },
];

export default function PickingPick() {
  const { order, workers: workerList } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");

  const [showPackConfirm, setShowPackConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [timestamps, setTimestamps] = useState<Record<TimestampField, string>>({
    move_start: "",
    arrive_at_shelf: "",
    pick_start: "",
    pack_start: "",
    pack_finished: "",
    customer_service_start: "",
    customer_service_finish: "",
  });
  const [skuCount, setSkuCount] = useState(1);
  const lastProcessedId = useRef<number | null>(null);

  // Reset form after successful save
  useEffect(() => {
    if (!fetcher.data?.ok) return;
    if (fetcher.state !== "idle") return;

    const createdId = fetcher.data.created_each_pick_id;
    if (!createdId || createdId === lastProcessedId.current) return;

    lastProcessedId.current = createdId ?? null;
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

  const recordTimestamp = (field: TimestampField) => {
    const now = new Date().toISOString();
    setTimestamps((prev) => ({ ...prev, [field]: now }));

    if (field === "pack_finished") {
      setShowPackConfirm(true);
    }
  };

  const handlePackConfirm = () => {
    setShowPackConfirm(false);
    if (formRef.current) {
      const formData = new FormData(formRef.current);
      fetcher.submit(formData, { method: "post" });
    }
  };

  const handlePackCancel = () => {
    setShowPackConfirm(false);
  };

  return (
    <div className="max-w-md p-2 mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Order info */}
      <div className="bg-white p-3 rounded-lg shadow mb-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">店舗：</span>
            <span className="font-medium">{order.store.store_name}</span>
          </div>
          <div>
            <span className="text-gray-500">注文番号：</span>
            <span className="font-mono font-bold">{order.order_number}</span>
          </div>
        </div>
      </div>

      <fetcher.Form method="post" ref={formRef} className="flex-1 flex flex-col gap-2">
        <input type="hidden" name="_intent" value="save_each_pick" />
        <input type="hidden" name="order_id" value={orderId || ""} />

        <div className="grid grid-cols-2 gap-2">

          {/* Worker select */}
          <div className="bg-white px-4 py-2 rounded-lg shadow">
            <div className="flex flex-row justify-center items-center h-full">
              <label className="block text-sm font-medium" hidden>作業者</label>
              <select
                name="worker_id"
                defaultValue={order.worker.id}
                className="w-full px-3 py-2 border rounded"
              >
                {workerList.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.worker_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SKU count */}
          <div className="bg-white px-4 py-2 rounded-lg shadow">
            <div className="flex flex-row justify-center items-center h-full">
              <label className="block text-sm font-medium">商品点数</label>
              <input
                type="number"
                name="sku_count"
                value={skuCount}
                onChange={(e) => setSkuCount(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full px-3 py-2 border rounded text-center text-xl"
              />
            </div>
          </div>
        </div>

        {/* Hidden timestamp inputs */}
        {TIMESTAMP_BUTTONS.map((btn) => (
          <input
            key={btn.name}
            type="hidden"
            name={btn.name}
            value={timestamps[btn.name]}
          />
        ))}

        {/* Timestamp buttons */}
        <div className="bg-white p-3 rounded-lg shadow flex-1 flex flex-col">
          <div className="grid grid-cols-1 gap-1 flex-1">
            {TIMESTAMP_BUTTONS.map((btn) => (
              <button
                key={btn.name}
                type="button"
                onClick={() => recordTimestamp(btn.name)}
                className={`px-4 mx-4 py-2 my-2 rounded-lg text-white font-medium text-left flex justify-between items-center ${
                  btn.isCustomerService
                    ? "bg-gray-500 hover:bg-gray-600"
                    : "bg-gray-900 hover:bg-gray-700"
                }`}
              >
                <span>{btn.label}</span>
                {timestamps[btn.name] && (
                  <span className="text-sm opacity-80 font-mono">
                    {new Date(timestamps[btn.name]).toLocaleTimeString("ja-JP")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </fetcher.Form>

      {/* Complete order button */}
      <div className="mt-4 pb-2">
        <button
          type="button"
          onClick={() => setShowCompleteConfirm(true)}
          className="w-full py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800"
        >
          ピッキング完了
        </button>
      </div>

      {/* Pack confirm modal */}
      {showPackConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">作業記録の登録</h3>
            <p className="text-gray-600 mb-4">
              この作業記録を登録しますか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePackCancel}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                onClick={handlePackConfirm}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete order confirm modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">注文完了の確認</h3>
            <p className="text-gray-600 mb-4">
              この注文を完了としてマークしますか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-100"
              >
                キャンセル
              </button>
              <Form method="post">
                <input type="hidden" name="_intent" value="complete_order" />
                <input type="hidden" name="order_id" value={orderId || ""} />
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
                >
                  完了
                </button>
              </Form>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {fetcher.data && !fetcher.data.ok && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-100 text-red-700 px-4 py-2 rounded z-40">
          {fetcher.data.formError}
        </div>
      )}
    </div>
  );
}
