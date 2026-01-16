import { Form, useLoaderData, useActionData } from "react-router";
import { eq } from "drizzle-orm";
import { db, workers } from "~/db";
import type { Route } from "./+types/worker";

export async function loader() {
  const allWorkers = await db.select().from(workers).orderBy(workers.id);
  return { workers: allWorkers };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "create") {
    const workerName = formData.get("worker_name");
    if (!workerName || typeof workerName !== "string" || !workerName.trim()) {
      return { ok: false, formError: "作業者名を入力してください" };
    }
    await db.insert(workers).values({ worker_name: workerName.trim() });
    return { ok: true };
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const workerName = formData.get("worker_name");
    if (!id || !workerName || typeof workerName !== "string" || !workerName.trim()) {
      return { ok: false, formError: "入力が不正です" };
    }
    await db.update(workers).set({ worker_name: workerName.trim() }).where(eq(workers.id, id));
    return { ok: true };
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    if (!id) {
      return { ok: false, formError: "IDが不正です" };
    }
    await db.delete(workers).where(eq(workers.id, id));
    return { ok: true };
  }

  return { ok: false, formError: "不明な操作です" };
}

export default function EditWorker() {
  const { workers: workerList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-4">作業者管理</h2>

      {actionData && !actionData.ok && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {actionData.formError}
        </div>
      )}

      {/* Create form */}
      <Form method="post" className="flex gap-2 mb-6">
        <input type="hidden" name="_intent" value="create" />
        <input
          type="text"
          name="worker_name"
          placeholder="新しい作業者名"
          className="flex-1 px-3 py-2 border rounded"
          required
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
        >
          追加
        </button>
      </Form>

      {/* Worker list */}
      <ul className="space-y-2">
        {workerList.map((worker) => (
          <li key={worker.id} className="flex items-center gap-2 bg-white p-3 rounded border">
            <Form method="post" className="flex-1 flex gap-2">
              <input type="hidden" name="_intent" value="update" />
              <input type="hidden" name="id" value={worker.id} />
              <input
                type="text"
                name="worker_name"
                defaultValue={worker.worker_name}
                className="flex-1 px-3 py-1 border rounded"
                required
              />
              <button
                type="submit"
                className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
              >
                更新
              </button>
            </Form>
            <Form method="post">
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="id" value={worker.id} />
              <button
                type="submit"
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                onClick={(e) => {
                  if (!confirm("削除しますか？")) {
                    e.preventDefault();
                  }
                }}
              >
                削除
              </button>
            </Form>
          </li>
        ))}
      </ul>
    </div>
  );
}
