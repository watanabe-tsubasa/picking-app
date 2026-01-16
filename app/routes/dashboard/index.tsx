import { Form, useLoaderData, useSearchParams } from "react-router";
import { db, stores, workers, orders } from "~/db";
import { useEffect } from "react";

export async function loader() {
  const [allStores, allWorkers, availableDates] = await Promise.all([
    db.select().from(stores).orderBy(stores.id),
    db.select().from(workers).orderBy(workers.id),
    db
      .selectDistinct({ work_date: orders.work_date })
      .from(orders)
      .orderBy(orders.work_date),
  ]);

  return {
    stores: allStores,
    workers: allWorkers,
    availableDates: availableDates.map((d) => d.work_date).reverse(),
  };
}

export default function DashboardIndex() {
  const { stores: storeList, workers: workerList, availableDates } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (error === "direct_access") {
      alert("検索画面から入力してください");
    }
  }, [error]);

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-6">検索条件</h2>

      <Form method="get" action="/dashboard/result" className="space-y-4">
        <input type="hidden" name="from" value="selector" />

        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium mb-2">日付</label>
          <select
            name="date"
            className="w-full px-3 py-2 border rounded"
            required
          >
            <option value="">選択してください</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
          {availableDates.length === 0 && (
            <p className="text-gray-500 text-sm mt-2">
              作業データがありません
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium mb-2">作業者</label>
          <select
            name="worker"
            defaultValue="all"
            className="w-full px-3 py-2 border rounded"
          >
            <option value="all">全作業者</option>
            {workerList.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.worker_name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium mb-2">店舗</label>
          <select
            name="store"
            defaultValue="all"
            className="w-full px-3 py-2 border rounded"
          >
            <option value="all">全店舗</option>
            {storeList.map((store) => (
              <option key={store.id} value={store.id}>
                {store.store_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800"
          disabled={availableDates.length === 0}
        >
          検索
        </button>
      </Form>
    </div>
  );
}
