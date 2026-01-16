import { Form, useLoaderData, useActionData, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { db, stores, workers, orders } from "~/db";
import type { Route } from "./+types/register";

function getJSTDateString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

export async function loader() {
  const [allStores, allWorkers, inProgressOrders] = await Promise.all([
    db.select().from(stores).orderBy(stores.id),
    db.select().from(workers).orderBy(workers.id),
    db
      .select({
        id: orders.id,
        order_number: orders.order_number,
        start_time: orders.start_time,
        store_id: orders.store_id,
        store_name: stores.store_name,
        worker_id: orders.worker_id,
        worker_name: workers.worker_name,
      })
      .from(orders)
      .leftJoin(stores, eq(orders.store_id, stores.id))
      .leftJoin(workers, eq(orders.worker_id, workers.id))
      .where(eq(orders.is_completed, false)),
  ]);

  return {
    stores: allStores,
    workers: allWorkers,
    inProgressOrders: inProgressOrders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      start_time: o.start_time,
      store: { id: o.store_id, store_name: o.store_name || "" },
      worker: { id: o.worker_id, worker_name: o.worker_name || "" },
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "create") {
    const storeId = Number(formData.get("store_id"));
    const workerId = Number(formData.get("worker_id"));
    const orderDigits7 = formData.get("order_digits7");

    const errors: Record<string, string> = {};
    if (!storeId) errors.store_id = "店舗を選択してください";
    if (!workerId) errors.worker_id = "作業者を選択してください";
    if (
      !orderDigits7 ||
      typeof orderDigits7 !== "string" ||
      !/^\d{7}$/.test(orderDigits7)
    ) {
      errors.order_digits7 = "注文番号は7桁の数字で入力してください";
    }

    if (Object.keys(errors).length > 0) {
      return { ok: false, fieldErrors: errors };
    }

    const now = new Date().toISOString();
    const result = await db
      .insert(orders)
      .values({
        store_id: storeId,
        worker_id: workerId,
        order_number: `A${orderDigits7}`,
        start_time: now,
        is_completed: false,
        work_date: getJSTDateString(),
      })
      .returning({ id: orders.id });

    return redirect(`/picking/pick?order_id=${result[0].id}`);
  }

  if (intent === "resume") {
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

    return redirect(`/picking/pick?order_id=${orderId}`);
  }

  return { ok: false, formError: "不明な操作です" };
}

export default function PickingRegister() {
  const { stores: storeList, workers: workerList, inProgressOrders } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">測定開始</h2>

      {actionData && !actionData.ok && actionData.formError && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {actionData.formError}
        </div>
      )}

      <Form method="post" className="space-y-4 bg-white p-4 rounded-lg shadow">
        <input type="hidden" name="_intent" value="create" />

        <div>
          <label className="block text-sm font-medium mb-1">店舗</label>
          <select
            name="store_id"
            className="w-full px-3 py-2 border rounded"
            required
          >
            <option value="">選択してください</option>
            {storeList.map((store) => (
              <option key={store.id} value={store.id}>
                {store.store_name}
              </option>
            ))}
          </select>
          {actionData?.fieldErrors?.store_id && (
            <p className="text-red-600 text-sm mt-1">
              {actionData.fieldErrors.store_id}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">作業者</label>
          <select
            name="worker_id"
            className="w-full px-3 py-2 border rounded"
            required
          >
            <option value="">選択してください</option>
            {workerList.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.worker_name}
              </option>
            ))}
          </select>
          {actionData?.fieldErrors?.worker_id && (
            <p className="text-red-600 text-sm mt-1">
              {actionData.fieldErrors.worker_id}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">注文番号</label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono">A</span>
            <input
              type="text"
              name="order_digits7"
              pattern="\d{7}"
              maxLength={7}
              placeholder="1234567"
              className="flex-1 px-3 py-2 border rounded font-mono"
              required
            />
          </div>
          {actionData?.fieldErrors?.order_digits7 && (
            <p className="text-red-600 text-sm mt-1">
              {actionData.fieldErrors.order_digits7}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800"
        >
          作業開始
        </button>
      </Form>

      {inProgressOrders.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-3">途中作業リスト</h3>
          <ul className="space-y-2">
            {inProgressOrders.map((order) => (
              <li key={order.id} className="bg-white p-3 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-bold">{order.order_number}</p>
                    <p className="text-sm text-gray-600">
                      {order.store.store_name} / {order.worker.worker_name}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="_intent" value="resume" />
                    <input type="hidden" name="order_id" value={order.id} />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700"
                    >
                      再開
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
