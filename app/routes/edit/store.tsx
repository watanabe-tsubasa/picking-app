import { Form, useLoaderData, useActionData } from "react-router";
import { eq } from "drizzle-orm";
import { db, stores } from "~/db";
import type { Route } from "./+types/store";

export async function loader() {
  const allStores = await db.select().from(stores).orderBy(stores.id);
  return { stores: allStores };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "create") {
    const storeName = formData.get("store_name");
    if (!storeName || typeof storeName !== "string" || !storeName.trim()) {
      return { ok: false, formError: "店舗名を入力してください" };
    }
    await db.insert(stores).values({ store_name: storeName.trim() });
    return { ok: true };
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const storeName = formData.get("store_name");
    if (!id || !storeName || typeof storeName !== "string" || !storeName.trim()) {
      return { ok: false, formError: "入力が不正です" };
    }
    await db.update(stores).set({ store_name: storeName.trim() }).where(eq(stores.id, id));
    return { ok: true };
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    if (!id) {
      return { ok: false, formError: "IDが不正です" };
    }
    await db.delete(stores).where(eq(stores.id, id));
    return { ok: true };
  }

  return { ok: false, formError: "不明な操作です" };
}

export default function EditStore() {
  const { stores: storeList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-4">店舗管理</h2>

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
          name="store_name"
          placeholder="新しい店舗名"
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

      {/* Store list */}
      <ul className="space-y-2">
        {storeList.map((store) => (
          <li key={store.id} className="flex items-center gap-2 bg-white p-3 rounded border">
            <Form method="post" className="flex-1 flex gap-2">
              <input type="hidden" name="_intent" value="update" />
              <input type="hidden" name="id" value={store.id} />
              <input
                type="text"
                name="store_name"
                defaultValue={store.store_name}
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
              <input type="hidden" name="id" value={store.id} />
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
