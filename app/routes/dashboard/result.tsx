import { useLoaderData, redirect } from "react-router";
import { useReducer, useMemo, useState } from "react";
import { eq, and } from "drizzle-orm";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { db, stores, workers, orders, eachPicks } from "~/db";
import type { Route } from "./+types/result";

type DashboardRow = {
  store_name: string;
  worker_name: string;
  order_number: string;
  sku_count: number;
  order_start_time: string;
  order_end_time: string;
  move_start: string | null;
  arrive_at_shelf: string | null;
  pick_start: string | null;
  pack_start: string | null;
  pack_finished: string | null;
  customer_service_start: string | null;
  customer_service_finish: string | null;
  order_id: number;
  order_worker_name: string;
};

type OrderAggRow = {
  store_name: string;
  order_number: string;
  worker_name: string;
  total_sku: number;
  start_time: string;
  end_time: string;
};

type WorkerAggRow = {
  store_name: string;
  worker_name: string;
  order_count: number;
  total_sku: number;
  total_time_ms: number;
};

type DisplayState = {
  aggregationUnit: "order" | "worker" | "each_pick";
  viewMode: "table" | "bar";
};

type DisplayAction =
  | { type: "SET_AGGREGATION"; payload: DisplayState["aggregationUnit"] }
  | { type: "SET_VIEW_MODE"; payload: DisplayState["viewMode"] };

export function displayReducer(
  state: DisplayState,
  action: DisplayAction
): DisplayState {
  switch (action.type) {
    case "SET_AGGREGATION":
      return { ...state, aggregationUnit: action.payload };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };
    default:
      return state;
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const date = url.searchParams.get("date");
  const workerParam = url.searchParams.get("worker");
  const storeParam = url.searchParams.get("store");

  if (from !== "selector") {
    return redirect("/dashboard?error=direct_access");
  }

  if (!date) {
    return redirect("/dashboard");
  }

  const workerId = workerParam === "all" ? null : Number(workerParam);
  const storeId = storeParam === "all" ? null : Number(storeParam);

  // Build conditions
  const conditions = [eq(orders.work_date, date), eq(orders.is_completed, true)];
  if (storeId) conditions.push(eq(orders.store_id, storeId));
  if (workerId) conditions.push(eq(orders.worker_id, workerId));

  const result = await db
    .select({
      store_name: stores.store_name,
      worker_name: workers.worker_name,
      order_number: orders.order_number,
      order_start_time: orders.start_time,
      order_end_time: orders.end_time,
      order_id: orders.id,
      order_worker_id: orders.worker_id,
      each_pick_worker_name: workers.worker_name,
      sku_count: eachPicks.sku_count,
      move_start: eachPicks.move_start,
      arrive_at_shelf: eachPicks.arrive_at_shelf,
      pick_start: eachPicks.pick_start,
      pack_start: eachPicks.pack_start,
      pack_finished: eachPicks.pack_finished,
      customer_service_start: eachPicks.customer_service_start,
      customer_service_finish: eachPicks.customer_service_finish,
    })
    .from(eachPicks)
    .innerJoin(orders, eq(eachPicks.order_id, orders.id))
    .innerJoin(stores, eq(orders.store_id, stores.id))
    .innerJoin(workers, eq(eachPicks.worker_id, workers.id))
    .where(and(...conditions));

  // Get order worker names separately
  const orderWorkerMap = new Map<number, string>();
  const orderIds = [...new Set(result.map((r) => r.order_id))];
  if (orderIds.length > 0) {
    const orderWorkers = await db
      .select({
        order_id: orders.id,
        worker_name: workers.worker_name,
      })
      .from(orders)
      .innerJoin(workers, eq(orders.worker_id, workers.id))
      .where(
        and(
          eq(orders.work_date, date),
          eq(orders.is_completed, true)
        )
      );
    orderWorkers.forEach((ow) => {
      orderWorkerMap.set(ow.order_id, ow.worker_name || "");
    });
  }

  const rows: DashboardRow[] = result.map((r) => ({
    store_name: r.store_name || "",
    worker_name: r.each_pick_worker_name || "",
    order_number: r.order_number,
    sku_count: r.sku_count,
    order_start_time: r.order_start_time,
    order_end_time: r.order_end_time || "",
    move_start: r.move_start,
    arrive_at_shelf: r.arrive_at_shelf,
    pick_start: r.pick_start,
    pack_start: r.pack_start,
    pack_finished: r.pack_finished,
    customer_service_start: r.customer_service_start,
    customer_service_finish: r.customer_service_finish,
    order_id: r.order_id,
    order_worker_name: orderWorkerMap.get(r.order_id) || "",
  }));

  return {
    query: {
      date,
      worker: workerParam === "all" ? "all" : Number(workerParam),
      store: storeParam === "all" ? "all" : Number(storeParam),
    },
    rows,
  };
}

function calculatePickingRate(totalSku: number, startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const hours = (end - start) / (1000 * 60 * 60);
  if (hours <= 0) return 0;
  return totalSku / hours;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const minutes = Math.round((end - start) / (1000 * 60));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${mins}分`;
}

function downloadCSV(data: string[][], filename: string) {
  const csvContent = data
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardResult() {
  const { query, rows } = useLoaderData<typeof loader>();
  const [state, dispatch] = useReducer(displayReducer, {
    aggregationUnit: "order",
    viewMode: "table",
  });

  // Aggregation
  const aggregatedByOrder = () => {
    const map = new Map<
      number,
      { store_name: string; order_number: string; worker_name: string; total_sku: number; start_time: string; end_time: string }
    >();
    rows.forEach((row) => {
      const existing = map.get(row.order_id);
      if (existing) {
        existing.total_sku += row.sku_count;
      } else {
        map.set(row.order_id, {
          store_name: row.store_name,
          order_number: row.order_number,
          worker_name: row.order_worker_name,
          total_sku: row.sku_count,
          start_time: row.order_start_time,
          end_time: row.order_end_time,
        });
      }
    });
    return Array.from(map.values());
  };

  const aggregatedByWorker = () => {
    const map = new Map<
      string,
      { store_name: string; worker_name: string; order_count: number; total_sku: number; total_time_ms: number }
    >();
    const orderSet = new Map<string, Set<number>>();

    rows.forEach((row) => {
      const key = `${row.store_name}-${row.order_worker_name}`;
      const existing = map.get(key);
      if (existing) {
        existing.total_sku += row.sku_count;
        orderSet.get(key)?.add(row.order_id);
      } else {
        map.set(key, {
          store_name: row.store_name,
          worker_name: row.order_worker_name,
          order_count: 1,
          total_sku: row.sku_count,
          total_time_ms: 0,
        });
        orderSet.set(key, new Set([row.order_id]));
      }
    });

    // Calculate total time from unique orders
    const orderTimes = new Map<number, { start: number; end: number }>();
    rows.forEach((row) => {
      if (!orderTimes.has(row.order_id)) {
        orderTimes.set(row.order_id, {
          start: new Date(row.order_start_time).getTime(),
          end: new Date(row.order_end_time).getTime(),
        });
      }
    });

    orderSet.forEach((orderIds, key) => {
      const data = map.get(key)!;
      data.order_count = orderIds.size;
      let totalTime = 0;
      orderIds.forEach((orderId) => {
        const times = orderTimes.get(orderId);
        if (times) totalTime += times.end - times.start;
      });
      data.total_time_ms = totalTime;
    });

    return Array.from(map.values());
  };

  const handleCSVExport = () => {
    let data: string[][] = [];
    const filename = `dashboard_${query.date}_${state.aggregationUnit}.csv`;

    if (state.aggregationUnit === "each_pick") {
      data = [
        ["店舗名", "作業者名", "注文番号", "商品点数", "作業開始", "作業終了", "移動開始", "棚前到着", "ピック開始", "梱包開始", "梱包完了", "お客さま対応開始", "お客さま対応終了"],
        ...rows.map((row) => [
          row.store_name,
          row.worker_name,
          row.order_number,
          String(row.sku_count),
          row.order_start_time,
          row.order_end_time,
          row.move_start || "",
          row.arrive_at_shelf || "",
          row.pick_start || "",
          row.pack_start || "",
          row.pack_finished || "",
          row.customer_service_start || "",
          row.customer_service_finish || "",
        ]),
      ];
    } else if (state.aggregationUnit === "order") {
      const agg = aggregatedByOrder();
      data = [
        ["店舗名", "注文番号", "作業者名", "合計商品点数", "全作業時間", "ピッキングレート"],
        ...agg.map((row) => [
          row.store_name,
          row.order_number,
          row.worker_name,
          String(row.total_sku),
          formatDuration(row.start_time, row.end_time),
          calculatePickingRate(row.total_sku, row.start_time, row.end_time).toFixed(1),
        ]),
      ];
    } else {
      const agg = aggregatedByWorker();
      data = [
        ["店舗名", "作業者名", "処理注文数", "合計商品点数", "全作業時間", "ピッキングレート"],
        ...agg.map((row) => {
          const hours = row.total_time_ms / (1000 * 60 * 60);
          const rate = hours > 0 ? row.total_sku / hours : 0;
          const minutes = Math.round(row.total_time_ms / (1000 * 60));
          const timeStr = minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
          return [
            row.store_name,
            row.worker_name,
            String(row.order_count),
            String(row.total_sku),
            timeStr,
            rate.toFixed(1),
          ];
        }),
      ];
    }

    downloadCSV(data, filename);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600 mr-2">集計単位:</label>
            <select
              value={state.aggregationUnit}
              onChange={(e) =>
                dispatch({
                  type: "SET_AGGREGATION",
                  payload: e.target.value as DisplayState["aggregationUnit"],
                })
              }
              className="px-3 py-1 border rounded"
            >
              <option value="order">注文単位</option>
              <option value="worker">作業者単位</option>
              <option value="each_pick">個別作業単位</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600 mr-2">表示形式:</label>
            <select
              value={state.viewMode}
              onChange={(e) =>
                dispatch({
                  type: "SET_VIEW_MODE",
                  payload: e.target.value as DisplayState["viewMode"],
                })
              }
              className="px-3 py-1 border rounded"
            >
              <option value="table">テーブル</option>
              <option value="bar">棒グラフ</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleCSVExport}
          className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
        >
          CSV出力
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-4">
        日付: {query.date} | 作業者: {query.worker === "all" ? "全員" : query.worker} | 店舗: {query.store === "all" ? "全店舗" : query.store}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white p-8 rounded-lg text-center text-gray-500">
          該当するデータがありません
        </div>
      ) : state.viewMode === "table" ? (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          {state.aggregationUnit === "each_pick" && (
            <EachPickTable data={rows} />
          )}
          {state.aggregationUnit === "order" && (
            <OrderTable data={aggregatedByOrder()} />
          )}
          {state.aggregationUnit === "worker" && (
            <WorkerTable data={aggregatedByWorker()} />
          )}
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg shadow">
          {state.aggregationUnit === "each_pick" ? (
            <p className="text-gray-500 text-center py-8">個別作業単位はグラフ表示に対応していません</p>
          ) : state.aggregationUnit === "order" ? (
            <OrderBarChart data={aggregatedByOrder()} />
          ) : (
            <WorkerBarChart data={aggregatedByWorker()} />
          )}
        </div>
      )}
    </div>
  );
}

// TanStack Table Components
const eachPickColumnHelper = createColumnHelper<DashboardRow>();
const eachPickColumns = [
  eachPickColumnHelper.accessor("store_name", { header: "店舗名" }),
  eachPickColumnHelper.accessor("order_number", {
    header: "注文番号",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  eachPickColumnHelper.accessor("worker_name", { header: "作業者名" }),
  eachPickColumnHelper.accessor("sku_count", {
    header: "商品点数",
    cell: (info) => <span className="text-right block">{info.getValue()}</span>,
  }),
  eachPickColumnHelper.accessor("order_start_time", {
    header: "作業開始",
    cell: (info) => new Date(info.getValue()).toLocaleString("ja-JP"),
  }),
  eachPickColumnHelper.accessor("order_end_time", {
    header: "作業終了",
    cell: (info) => new Date(info.getValue()).toLocaleString("ja-JP"),
  }),
];

function EachPickTable({ data }: { data: DashboardRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns: eachPickColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-gray-700"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? " ↕"}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={eachPickColumns.length} className="h-24 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} 件中{" "}
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{" "}
          件を表示
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

const orderColumnHelper = createColumnHelper<OrderAggRow>();
// const orderColumns = [
//   orderColumnHelper.accessor("store_name", { header: "店舗名" }),
//   orderColumnHelper.accessor("order_number", {
//     header: "注文番号",
//     cell: (info) => <span className="font-mono">{info.getValue()}</span>,
//   }),
//   orderColumnHelper.accessor("worker_name", { header: "作業者名" }),
//   orderColumnHelper.accessor("total_sku", {
//     header: "合計商品点数",
//     cell: (info) => <span className="text-right block">{info.getValue()}</span>,
//   }),
//   orderColumnHelper.display({
//     id: "duration",
//     header: "作業時間",
//     enableSorting: true,
//     cell: (info) => (
//       <span className="text-right block">
//         {formatDuration(info.row.original.start_time, info.row.original.end_time)}
//       </span>
//     ),
//     sortingFn: (rowA, rowB) => {
//       const durationA = new Date(rowA.original.end_time).getTime() - new Date(rowA.original.start_time).getTime();
//       const durationB = new Date(rowB.original.end_time).getTime() - new Date(rowB.original.start_time).getTime();
//       return durationA - durationB;
//     },
//   }),
//   orderColumnHelper.display({
//     id: "picking_rate",
//     header: "ピッキングレート",
//     enableSorting: true,
//     cell: (info) => (
//       <span className="text-right block">
//         {calculatePickingRate(
//           info.row.original.total_sku,
//           info.row.original.start_time,
//           info.row.original.end_time
//         ).toFixed(1)}
//         /h
//       </span>
//     ),
//     sortingFn: (rowA, rowB) => {
//       const rateA = calculatePickingRate(rowA.original.total_sku, rowA.original.start_time, rowA.original.end_time);
//       const rateB = calculatePickingRate(rowB.original.total_sku, rowB.original.start_time, rowB.original.end_time);
//       return rateA - rateB;
//     },
//   }),
// ];

const orderColumns = [
  orderColumnHelper.accessor("store_name", { header: "店舗名" }),
  orderColumnHelper.accessor("order_number", {
    header: "注文番号",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  orderColumnHelper.accessor("worker_name", { header: "作業者名" }),
  orderColumnHelper.accessor("total_sku", {
    header: "合計商品点数",
    cell: (info) => <span className="text-right block">{info.getValue()}</span>,
  }),

  // ✅ 作業時間（値を持つ列にする）
  orderColumnHelper.accessor(
    (row) => new Date(row.end_time).getTime() - new Date(row.start_time).getTime(),
    {
      id: "duration_ms",
      header: "作業時間",
      cell: (info) => (
        <span className="text-right block">
          {formatDuration(info.row.original.start_time, info.row.original.end_time)}
        </span>
      ),
      sortingFn: "basic",
    }
  ),

  // ✅ ピッキングレート（値を持つ列にする）
  orderColumnHelper.accessor(
    (row) => calculatePickingRate(row.total_sku, row.start_time, row.end_time),
    {
      id: "picking_rate",
      header: "ピッキングレート",
      cell: (info) => (
        <span className="text-right block">{info.getValue().toFixed(1)}/h</span>
      ),
      sortingFn: "basic",
    }
  ),
];


function OrderTable({ data }: { data: OrderAggRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns: orderColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-gray-700"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? " ↕"}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={orderColumns.length} className="h-24 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} 件中{" "}
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{" "}
          件を表示
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

const workerColumnHelper = createColumnHelper<WorkerAggRow>();
// const workerColumns = [
//   workerColumnHelper.accessor("store_name", { header: "店舗名" }),
//   workerColumnHelper.accessor("worker_name", { header: "作業者名" }),
//   workerColumnHelper.accessor("order_count", {
//     header: "処理注文数",
//     cell: (info) => <span className="text-right block">{info.getValue()}</span>,
//   }),
//   workerColumnHelper.accessor("total_sku", {
//     header: "合計商品点数",
//     cell: (info) => <span className="text-right block">{info.getValue()}</span>,
//   }),
//   workerColumnHelper.display({
//     id: "duration",
//     header: "作業時間",
//     enableSorting: true,
//     cell: (info) => {
//       const minutes = Math.round(info.row.original.total_time_ms / (1000 * 60));
//       const timeStr = minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
//       return <span className="text-right block">{timeStr}</span>;
//     },
//     sortingFn: (rowA, rowB) => rowA.original.total_time_ms - rowB.original.total_time_ms,
//   }),
//   workerColumnHelper.display({
//     id: "picking_rate",
//     header: "ピッキングレート",
//     enableSorting: true,
//     cell: (info) => {
//       const hours = info.row.original.total_time_ms / (1000 * 60 * 60);
//       const rate = hours > 0 ? info.row.original.total_sku / hours : 0;
//       return <span className="text-right block">{rate.toFixed(1)}/h</span>;
//     },
//     sortingFn: (rowA, rowB) => {
//       const hoursA = rowA.original.total_time_ms / (1000 * 60 * 60);
//       const hoursB = rowB.original.total_time_ms / (1000 * 60 * 60);
//       const rateA = hoursA > 0 ? rowA.original.total_sku / hoursA : 0;
//       const rateB = hoursB > 0 ? rowB.original.total_sku / hoursB : 0;
//       return rateA - rateB;
//     },
//   }),
// ];
const workerColumns = [
  workerColumnHelper.accessor("store_name", { header: "店舗名" }),
  workerColumnHelper.accessor("worker_name", { header: "作業者名" }),
  workerColumnHelper.accessor("order_count", {
    header: "処理注文数",
    cell: (info) => <span className="text-right block">{info.getValue()}</span>,
  }),
  workerColumnHelper.accessor("total_sku", {
    header: "合計商品点数",
    cell: (info) => <span className="text-right block">{info.getValue()}</span>,
  }),

  workerColumnHelper.accessor((row) => row.total_time_ms, {
    id: "duration_ms",
    header: "作業時間",
    cell: (info) => {
      const minutes = Math.round(info.getValue() / (1000 * 60));
      return (
        <span className="text-right block">
          {minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60}分`}
        </span>
      );
    },
    sortingFn: "basic",
  }),

  workerColumnHelper.accessor((row) => {
    const hours = row.total_time_ms / (1000 * 60 * 60);
    return hours > 0 ? row.total_sku / hours : 0;
  }, {
    id: "picking_rate",
    header: "ピッキングレート",
    cell: (info) => <span className="text-right block">{info.getValue().toFixed(1)}/h</span>,
    sortingFn: "basic",
  }),
];

function WorkerTable({ data }: { data: WorkerAggRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns: workerColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-gray-700"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? " ↕"}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={workerColumns.length} className="h-24 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} 件中{" "}
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{" "}
          件を表示
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            type="button"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

// Bar chart for order aggregation (only picking rate, no total_sku)
function OrderBarChart({ data }: { data: OrderAggRow[] }) {
  const chartData = useMemo(() => {
    return data.map((row) => ({
      name: row.order_number,
      total_sku: row.total_sku,
      picking_rate: Number(calculatePickingRate(row.total_sku, row.start_time, row.end_time).toFixed(1)),
      worker_name: row.worker_name,
    }));
  }, [data]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-600 mb-4">注文別ピッキングレート (SKU/時間)</h3>
      <div style={{ width: "100%", height: 400 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={60}
              fontSize={12}
            />
            <YAxis
              stroke="#3b82f6"
              label={{ value: "ピッキングレート", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const row = payload[0].payload;
                  return (
                    <div className="bg-white p-2 border rounded shadow text-sm">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-gray-600">作業者: {row.worker_name}</p>
                      <p className="text-gray-900">レート: {row.picking_rate}/h</p>
                      <p className="text-gray-600">商品点数: {row.total_sku}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="picking_rate" fill="#374151" name="ピッキングレート" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Bar chart for worker aggregation
function WorkerBarChart({ data }: { data: WorkerAggRow[] }) {
  const chartData = useMemo(() => {
    return data.map((row) => {
      const hours = row.total_time_ms / (1000 * 60 * 60);
      const rate = hours > 0 ? row.total_sku / hours : 0;
      return {
        name: row.worker_name,
        store_name: row.store_name,
        total_sku: row.total_sku,
        order_count: row.order_count,
        picking_rate: Number(rate.toFixed(1)),
      };
    });
  }, [data]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-600 mb-4">作業者別ピッキングレート (SKU/時間)</h3>
      <div style={{ width: "100%", height: 400 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={60}
              fontSize={12}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#374151"
              label={{ value: "ピッキングレート", angle: -90, position: "insideLeft" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#6b7280"
              label={{ value: "商品点数", angle: 90, position: "insideRight" }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const row = payload[0].payload;
                  return (
                    <div className="bg-white p-2 border rounded shadow text-sm">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-gray-600">店舗: {row.store_name}</p>
                      <p className="text-gray-900">レート: {row.picking_rate}/h</p>
                      <p className="text-gray-600">商品点数: {row.total_sku}</p>
                      <p className="text-gray-600">注文数: {row.order_count}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar yAxisId="left" dataKey="picking_rate" fill="#374151" name="ピッキングレート" />
            <Bar yAxisId="right" dataKey="total_sku" fill="#9ca3af" name="商品点数" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
