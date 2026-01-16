import { Link, Outlet } from "react-router";

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-sm text-gray-300 hover:text-white">
          ← トップ
        </Link>
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <div className="w-12" />
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
