import { Link, Outlet } from "react-router";

export default function PickingLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-gray-300 hover:text-white">
          ← トップ
        </Link>
        <h1 className="text-lg font-bold">ピッキング測定</h1>
        <div className="w-12" />
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
